from __future__ import annotations

import logging
import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock
from typing import Any, Dict, List

from openai import OpenAI

from .config import get_settings
from .index_manager import PageIndexManager
from .retrieval import TraversalEngine

logger = logging.getLogger(__name__)


@dataclass
class QueryResult:
    answer: str
    latency_ms: int


@dataclass
class RetrievalTraceResult:
    steps: List[Dict[str, Any]]
    latency: int
    tokens: int
    nodes_loaded_from_cache: int = 0
    nodes_loaded_from_disk: int = 0
    nodes_evaluated: int = 0
    tree_depth: int = 0


class QueryEngine:
    _instance: "QueryEngine | None" = None

    def __new__(cls, model_name: str | None = None) -> "QueryEngine":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, model_name: str | None = None) -> None:
        if self._initialized:
            return

        settings = get_settings(model_override=model_name)
        self.model_name = settings.model_name
        self.client = OpenAI(api_key=settings.api_key)
        self.index_manager = PageIndexManager.get_instance(model_name=self.model_name)
        self.index_data = self.index_manager.get_or_create_index()
        self.traversal_engine = TraversalEngine(self.index_manager.index_dir)
        self._answer_cache: "OrderedDict[str, QueryResult]" = OrderedDict()
        self._retrieval_cache: "OrderedDict[str, RetrievalTraceResult]" = OrderedDict()
        self._cache_lock = Lock()
        self._max_cache_size = 128
        self._initialized = True
        logger.info("QueryEngine initialized with model=%s", self.model_name)

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"[a-zA-Z0-9]+", text.lower())

    def _flatten_nodes(self) -> List[Dict[str, str]]:
        nodes: List[Dict[str, str]] = []

        def walk(node_list: List[Dict[str, Any]], doc_name: str) -> None:
            for node in node_list:
                title = str(node.get("title", "")).strip()
                summary = str(node.get("summary", "")).strip()
                if title or summary:
                    nodes.append(
                        {
                            "doc_name": doc_name,
                            "title": title,
                            "summary": summary,
                        }
                    )
                children = node.get("nodes", [])
                if isinstance(children, list) and children:
                    walk(children, doc_name)

        for doc in self.index_data.get("documents", []):
            doc_name = str(doc.get("doc_name", "unknown_document"))
            structure = doc.get("structure", [])
            if isinstance(structure, list):
                walk(structure, doc_name)

        return nodes

    def _normalize_question(self, question: str) -> str:
        return " ".join(self._tokenize(question))

    def _cache_key(self, question: str) -> str:
        built_at = self.index_data.get("built_at_epoch", 0)
        return f"{self._normalize_question(question)}::{built_at}"

    def _refresh_index_if_stale(self) -> None:
        latest = self.index_manager.get_or_create_index(rebuild=False)
        current_epoch = int(self.index_data.get("built_at_epoch", 0))
        latest_epoch = int(latest.get("built_at_epoch", 0))
        if latest_epoch >= current_epoch:
            self.index_data = latest

    def _cache_get(
        self, cache: "OrderedDict[str, Any]", key: str
    ) -> Any | None:
        with self._cache_lock:
            value = cache.get(key)
            if value is None:
                return None
            cache.move_to_end(key)
            return value

    def _cache_set(self, cache: "OrderedDict[str, Any]", key: str, value: Any) -> None:
        with self._cache_lock:
            cache[key] = value
            cache.move_to_end(key)
            while len(cache) > self._max_cache_size:
                cache.popitem(last=False)

    def _select_contexts(self, question: str, top_k: int = 6) -> List[Dict[str, str]]:
        hierarchical_contexts = self._select_contexts_from_hierarchical_tree(question, top_k=top_k)
        if hierarchical_contexts:
            return hierarchical_contexts

        question_tokens = self._tokenize(question)
        question_terms = set(question_tokens)
        if not question_terms:
            return []

        adaptive_top_k = top_k
        if len(question_tokens) <= 4:
            adaptive_top_k = 4
        elif len(question_tokens) >= 12:
            adaptive_top_k = 8

        scored: List[tuple[float, Dict[str, str]]] = []
        for node in self._flatten_nodes():
            title_lower = node["title"].lower()
            summary_lower = node["summary"].lower()
            haystack = f"{title_lower} {summary_lower}"

            overlap = sum(1 for term in question_terms if term in haystack)
            if overlap == 0:
                continue

            title_overlap = sum(1 for term in question_terms if term in title_lower)
            coverage = overlap / max(len(question_terms), 1)
            score = float(overlap) + (title_overlap * 1.5) + coverage
            scored.append((score, node))

        scored.sort(key=lambda item: item[0], reverse=True)
        deduped: List[Dict[str, str]] = []
        seen = set()
        for _, item in scored:
            dedupe_key = (
                item.get("doc_name", "").strip().lower(),
                item.get("title", "").strip().lower(),
            )
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            deduped.append(item)
            if len(deduped) >= adaptive_top_k:
                break
        return deduped

    def _select_contexts_from_hierarchical_tree(
        self, question: str, top_k: int = 6
    ) -> List[Dict[str, str]]:
        trace = self.traversal_engine.traverse(question, top_k_per_level=2)
        contexts: List[Dict[str, str]] = []
        for node in trace.selected_nodes:
            text = str(node.get("metadata", {}).get("text", "")).strip()
            summary = text if text else str(node.get("summary", "")).strip()
            if not summary:
                continue
            contexts.append(
                {
                    "doc_name": str(node.get("file_path", "document")),
                    "title": str(node.get("title", "Section")),
                    "summary": summary[:2000],
                }
            )
            if len(contexts) >= top_k:
                break
        return contexts

    def _build_prompt(self, question: str, contexts: List[Dict[str, str]]) -> str:
        context_blocks = []
        for i, ctx in enumerate(contexts, start=1):
            context_blocks.append(
                f"[Context {i}]\n"
                f"Document: {ctx['doc_name']}\n"
                f"Section: {ctx['title']}\n"
                f"Summary: {ctx['summary']}\n"
            )
        context_text = "\n".join(context_blocks) if context_blocks else "No relevant context found."

        return (
            "You are a document Q&A assistant. Answer the user's question only from the "
            "provided context. If the answer is not present, say you cannot find it in "
            "the indexed documents.\n\n"
            f"Question:\n{question}\n\n"
            f"Context:\n{context_text}\n"
        )

    def query(self, question: str) -> QueryResult:
        query_start = time.perf_counter()

        if not isinstance(question, str) or not question.strip():
            raise ValueError("Invalid query: 'question' must be a non-empty string.")

        self._refresh_index_if_stale()
        cleaned_question = question.strip()
        key = self._cache_key(cleaned_question)
        cached_answer = self._cache_get(self._answer_cache, key)
        if cached_answer is not None:
            return QueryResult(answer=cached_answer.answer, latency_ms=1)

        contexts = self._select_contexts(cleaned_question)
        prompt = self._build_prompt(cleaned_question, contexts)

        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": "Answer accurately and concisely from provided contexts.",
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            answer = (response.choices[0].message.content or "").strip()
            if not answer:
                answer = "I could not generate an answer from the indexed documents."
        except Exception as exc:
            logger.exception("Query failed")
            raise RuntimeError(f"Query execution failed: {exc}") from exc

        latency_ms = int((time.perf_counter() - query_start) * 1000)
        logger.info("Query latency: %d ms", latency_ms)
        result = QueryResult(answer=answer, latency_ms=latency_ms)
        self._cache_set(self._answer_cache, key, result)
        return result

    def get_index_structure(self) -> Dict[str, Any]:
        """
        Return the loaded index payload for frontend visualization.
        """
        self._refresh_index_if_stale()
        return self.index_data

    def get_retrieval_trace(self, question: str) -> RetrievalTraceResult:
        """
        Build a lightweight retrieval trace from context selection without
        making a second model-generation call.
        """
        self._refresh_index_if_stale()
        cleaned_question = question.strip()
        key = self._cache_key(cleaned_question)
        cached_trace = self._cache_get(self._retrieval_cache, key)
        if cached_trace is not None:
            return RetrievalTraceResult(
                steps=cached_trace.steps,
                latency=1,
                tokens=cached_trace.tokens,
                nodes_loaded_from_cache=cached_trace.nodes_loaded_from_cache,
                nodes_loaded_from_disk=cached_trace.nodes_loaded_from_disk,
                nodes_evaluated=cached_trace.nodes_evaluated,
                tree_depth=cached_trace.tree_depth,
            )

        traversal = self.traversal_engine.traverse(cleaned_question, top_k_per_level=2)
        steps: List[Dict[str, Any]] = []
        for item in traversal.traversal:
            steps.append(
                {
                    "node": item.get("title", "Unknown"),
                    "node_id": item.get("node_id"),
                    "selected": True,
                    "level": item.get("level", 0),
                    "score": item.get("score", 0.0),
                    "depth": item.get("depth", 0),
                }
            )

        if not steps:
            steps = [{"node": "No relevant section found", "selected": False, "level": 0}]

        estimated_tokens = max(80, 40 + len(cleaned_question) // 3 + len(steps) * 50)
        latency_ms = traversal.latency_ms

        result = RetrievalTraceResult(
            steps=steps,
            latency=latency_ms,
            tokens=estimated_tokens,
            nodes_loaded_from_cache=traversal.nodes_loaded_from_cache,
            nodes_loaded_from_disk=traversal.nodes_loaded_from_disk,
            nodes_evaluated=traversal.nodes_evaluated,
            tree_depth=traversal.tree_depth,
        )
        self._cache_set(self._retrieval_cache, key, result)
        return result


from __future__ import annotations

import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

from app.observability import metrics_collector
from app.storage import LazyNodeStore
from app.websocket import traversal_events


@dataclass
class RetrievalTraceDetails:
    query: str
    traversal: List[Dict[str, Any]]
    nodes_loaded_from_cache: int
    nodes_loaded_from_disk: int
    nodes_evaluated: int
    tree_depth: int
    latency_ms: int
    selected_nodes: List[Dict[str, Any]]


class TraversalEngine:
    def __init__(self, index_dir: Path) -> None:
        self.store = LazyNodeStore(index_dir / "hierarchical")

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"[a-zA-Z0-9]+", text.lower())

    def _score_node(self, node: Dict[str, Any], query_terms: set[str]) -> float:
        haystack = f"{node.get('title', '')} {node.get('summary', '')}".lower()
        overlap = sum(1 for term in query_terms if term in haystack)
        title_overlap = sum(1 for term in query_terms if term in str(node.get("title", "")).lower())
        return float(overlap + (title_overlap * 1.5))

    def traverse(self, query: str, top_k_per_level: int = 3) -> RetrievalTraceDetails:
        started = time.perf_counter()
        root_pointer = self.store.load_root_pointer()
        if not root_pointer:
            return RetrievalTraceDetails(
                query=query,
                traversal=[],
                nodes_loaded_from_cache=0,
                nodes_loaded_from_disk=0,
                nodes_evaluated=0,
                tree_depth=0,
                latency_ms=0,
                selected_nodes=[],
            )

        query_terms = set(self._tokenize(query))
        traversal: List[Dict[str, Any]] = []
        selected_nodes: List[Dict[str, Any]] = []
        current_ids = [str(root_pointer["root_id"])]
        depth = 0
        cache_before = metrics_collector.snapshot()["cache_hits"]
        disk_before = metrics_collector.snapshot()["nodes_loaded_from_disk"]
        evaluated = 0

        while current_ids and depth <= 6:
            depth += 1
            loaded_nodes: List[Dict[str, Any]] = []
            for node_id in current_ids:
                node, source = self.store.load_node(node_id)
                if not node:
                    continue
                traversal_events.publish(
                    {
                        "event": "node_evaluated",
                        "node_id": node["id"],
                        "level": node.get("level", depth - 1),
                        "source": source,
                        "title": node.get("title", ""),
                    }
                )
                metrics_collector.record_node_evaluated()
                loaded_nodes.append(node)
                evaluated += 1

            if not loaded_nodes:
                break

            scored = sorted(
                ((self._score_node(node, query_terms), node) for node in loaded_nodes),
                key=lambda item: item[0],
                reverse=True,
            )
            kept = [item[1] for item in scored[:top_k_per_level]]
            for node in kept:
                traversal_events.publish(
                    {
                        "event": "node_selected",
                        "node_id": node["id"],
                        "level": node.get("level", depth - 1),
                        "title": node.get("title", ""),
                    }
                )

            traversal.extend(
                {
                    "depth": depth,
                    "node_id": node["id"],
                    "title": node.get("title", ""),
                    "level": node.get("level", depth - 1),
                    "score": float(self._score_node(node, query_terms)),
                }
                for node in kept
            )
            selected_nodes.extend(kept)

            next_ids: List[str] = []
            for node in kept:
                next_ids.extend(node.get("children_ids", []))
            current_ids = next_ids

            if not current_ids:
                break

        latency_ms = int((time.perf_counter() - started) * 1000)
        metrics_collector.record_tree_depth(depth)
        metrics_collector.record_retrieval_latency(latency_ms)
        cache_after = metrics_collector.snapshot()["cache_hits"]
        disk_after = metrics_collector.snapshot()["nodes_loaded_from_disk"]

        traversal_events.publish({"event": "answer_generated"})

        return RetrievalTraceDetails(
            query=query,
            traversal=traversal,
            nodes_loaded_from_cache=max(0, int(cache_after - cache_before)),
            nodes_loaded_from_disk=max(0, int(disk_after - disk_before)),
            nodes_evaluated=evaluated,
            tree_depth=depth,
            latency_ms=latency_ms,
            selected_nodes=selected_nodes,
        )

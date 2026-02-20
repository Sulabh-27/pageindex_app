from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any, Dict, Generator, Iterable, List

from pypdf import PdfReader

from app.storage import LazyNodeStore


class BalancedHierarchicalIndexer:
    def __init__(
        self,
        store: LazyNodeStore,
        chunk_size_words: int = 500,
        max_children_per_node: int = 10,
        max_depth: int = 6,
    ) -> None:
        self.store = store
        self.chunk_size_words = chunk_size_words
        self.max_children_per_node = max_children_per_node
        self.max_depth = max_depth

    def stream_pdf_pages(self, pdf_path: Path) -> Generator[str, None, None]:
        reader = PdfReader(str(pdf_path))
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                yield text

    def stream_text_file(self, text_path: Path) -> Generator[str, None, None]:
        with text_path.open("r", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                if line.strip():
                    yield line

    def stream_markdown_file(self, md_path: Path) -> Generator[str, None, None]:
        with md_path.open("r", encoding="utf-8", errors="ignore") as handle:
            buffer: List[str] = []
            for line in handle:
                if line.startswith("#") and buffer:
                    yield "".join(buffer)
                    buffer = [line]
                else:
                    buffer.append(line)
            if buffer:
                yield "".join(buffer)

    def _stable_hash(self, value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]

    def _words_from_stream(self, text_stream: Iterable[str]) -> Generator[str, None, None]:
        for block in text_stream:
            for word in block.split():
                yield word

    def _chunk_words(self, text_stream: Iterable[str]) -> List[str]:
        words: List[str] = []
        chunks: List[str] = []
        for word in self._words_from_stream(text_stream):
            words.append(word)
            if len(words) >= self.chunk_size_words:
                chunks.append(" ".join(words))
                words = []
        if words:
            chunks.append(" ".join(words))
        return chunks

    def _title_for_level(self, level: int, index: int) -> str:
        if level == 0:
            return "Root"
        if level == 1:
            return f"Volume {index + 1}"
        if level == 2:
            return f"Chapter {index + 1}"
        if level == 3:
            return f"Section {index + 1}"
        return f"Chunk Group {index + 1}"

    def _summarize(self, text: str, max_words: int = 40) -> str:
        parts = text.split()
        return " ".join(parts[:max_words]) if parts else ""

    def _make_node(
        self,
        *,
        node_id: str,
        parent_id: str | None,
        level: int,
        title: str,
        summary: str,
        fingerprint: str,
        file_path: str,
        metadata: Dict[str, Any],
        children_ids: list[str],
    ) -> Dict[str, Any]:
        return {
            "id": node_id,
            "parent_id": parent_id,
            "children_ids": children_ids,
            "level": level,
            "title": title,
            "summary": summary,
            "fingerprint": fingerprint,
            "file_path": file_path,
            "metadata": metadata,
        }

    def _build_leaf_nodes(self, chunks: List[str], file_path: str) -> List[Dict[str, Any]]:
        nodes: List[Dict[str, Any]] = []
        leaf_level = self.max_depth
        for i, text in enumerate(chunks):
            node_id = f"chunk-{self._stable_hash(f'{file_path}:{i}:{text[:80]}')}"
            fingerprint = self._stable_hash(text)
            node = self._make_node(
                node_id=node_id,
                parent_id=None,
                level=leaf_level,
                title=f"Chunk {i + 1}",
                summary=self._summarize(text),
                fingerprint=fingerprint,
                file_path=file_path,
                metadata={"word_count": len(text.split()), "chunk_index": i, "text": text},
                children_ids=[],
            )
            nodes.append(node)
        return nodes

    def _group_children(
        self, children: List[Dict[str, Any]], level: int, file_path: str
    ) -> List[Dict[str, Any]]:
        grouped: List[Dict[str, Any]] = []
        for i in range(0, len(children), self.max_children_per_node):
            block = children[i : i + self.max_children_per_node]
            combined_summary = " ".join(item["summary"] for item in block if item.get("summary"))
            parent_seed = "|".join(item["id"] for item in block)
            node_id = f"lvl{level}-{self._stable_hash(parent_seed)}"
            node = self._make_node(
                node_id=node_id,
                parent_id=None,
                level=level,
                title=self._title_for_level(level, math.floor(i / self.max_children_per_node)),
                summary=self._summarize(combined_summary),
                fingerprint=self._stable_hash(combined_summary or parent_seed),
                file_path=file_path,
                metadata={"child_count": len(block)},
                children_ids=[item["id"] for item in block],
            )
            for child in block:
                child["parent_id"] = node_id
            grouped.append(node)
        return grouped

    def _build_tree_nodes(self, leaf_nodes: List[Dict[str, Any]], file_path: str) -> Dict[str, Any]:
        all_nodes: List[Dict[str, Any]] = []
        current_level_nodes = leaf_nodes
        all_nodes.extend(leaf_nodes)

        level = self.max_depth - 1
        while len(current_level_nodes) > 1 and level >= 0:
            grouped = self._group_children(current_level_nodes, level, file_path)
            all_nodes.extend(grouped)
            current_level_nodes = grouped
            level -= 1

        root = current_level_nodes[0] if current_level_nodes else None
        if root is None:
            root = self._make_node(
                node_id=f"root-{self._stable_hash(file_path)}",
                parent_id=None,
                level=0,
                title="Root",
                summary="Empty document",
                fingerprint=self._stable_hash(file_path),
                file_path=file_path,
                metadata={"child_count": 0},
                children_ids=[],
            )
            all_nodes.append(root)
        else:
            root["level"] = 0
            root["title"] = "Root"
        return {"root": root, "nodes": all_nodes}

    def build_from_stream(self, text_stream: Iterable[str], file_path: str) -> Dict[str, Any]:
        chunks = self._chunk_words(text_stream)
        leaf_nodes = self._build_leaf_nodes(chunks, file_path)
        tree = self._build_tree_nodes(leaf_nodes, file_path)
        root = tree["root"]
        nodes = tree["nodes"]

        for node in nodes:
            node["metadata"]["max_children_per_node"] = self.max_children_per_node
            node["metadata"]["chunk_size_words"] = self.chunk_size_words
            node["metadata"]["max_depth"] = self.max_depth
            self.store.save_node(node)

        self.store.save_root_pointer(
            root_id=root["id"],
            metadata={
                "file_path": file_path,
                "chunk_size_words": self.chunk_size_words,
                "max_children_per_node": self.max_children_per_node,
                "max_depth": self.max_depth,
                "node_count": len(nodes),
            },
        )
        return {"root_id": root["id"], "node_count": len(nodes), "chunk_count": len(leaf_nodes)}

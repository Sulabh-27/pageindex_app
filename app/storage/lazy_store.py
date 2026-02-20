from __future__ import annotations

import json
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Dict

from app.observability import metrics_collector


@dataclass
class NodeRecord:
    id: str
    parent_id: str | None
    children_ids: list[str]
    level: int
    title: str
    summary: str
    fingerprint: str
    file_path: str
    metadata: Dict[str, Any]


class LazyNodeStore:
    LEVEL_DIRS = {
        0: "root",
        1: "volumes",
        2: "chapters",
        3: "sections",
        4: "chunks",
        5: "chunks_l5",
        6: "chunks_l6",
    }

    def __init__(self, index_root: Path, max_cache_size: int = 5000) -> None:
        self.index_root = index_root
        self.max_cache_size = max_cache_size
        self._cache: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
        self._lock = Lock()
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        self.index_root.mkdir(parents=True, exist_ok=True)
        for folder in self.LEVEL_DIRS.values():
            (self.index_root / folder).mkdir(parents=True, exist_ok=True)

    def _path_for(self, node_id: str, level: int) -> Path:
        folder = self.LEVEL_DIRS.get(level, "chunks_l6")
        return self.index_root / folder / f"{node_id}.json"

    def save_node(self, node: Dict[str, Any]) -> None:
        path = self._path_for(node["id"], int(node["level"]))
        path.write_text(json.dumps(node, ensure_ascii=False), encoding="utf-8")
        with self._lock:
            self._cache[node["id"]] = node
            self._cache.move_to_end(node["id"])
            while len(self._cache) > self.max_cache_size:
                self._cache.popitem(last=False)

    def load_node(
        self, node_id: str, level_hint: int | None = None
    ) -> tuple[Dict[str, Any] | None, str]:
        with self._lock:
            cached = self._cache.get(node_id)
            if cached is not None:
                self._cache.move_to_end(node_id)
                metrics_collector.record_cache_hit()
                return cached, "cache"
            metrics_collector.record_cache_miss()

        candidate_levels = [level_hint] if level_hint is not None else list(self.LEVEL_DIRS.keys())
        for level in candidate_levels:
            if level is None:
                continue
            path = self._path_for(node_id, int(level))
            if path.exists():
                try:
                    node = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    return None, "disk"
                metrics_collector.record_disk_load()
                with self._lock:
                    self._cache[node_id] = node
                    self._cache.move_to_end(node_id)
                    while len(self._cache) > self.max_cache_size:
                        self._cache.popitem(last=False)
                return node, "disk"
        return None, "miss"

    def save_root_pointer(self, root_id: str, metadata: Dict[str, Any]) -> None:
        payload = {"root_id": root_id, "metadata": metadata}
        (self.index_root / "root.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def load_root_pointer(self) -> Dict[str, Any] | None:
        path = self.index_root / "root.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

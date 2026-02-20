from __future__ import annotations

import time
from threading import Lock
from typing import Any, Dict


class MetricsCollector:
    def __init__(self) -> None:
        self._lock = Lock()
        self._state: Dict[str, Any] = {
            "cache_hits": 0,
            "cache_misses": 0,
            "nodes_loaded_from_disk": 0,
            "nodes_evaluated": 0,
            "max_tree_depth_seen": 0,
            "retrieval_count": 0,
            "last_retrieval_latency_ms": 0,
            "avg_retrieval_latency_ms": 0.0,
            "last_updated_epoch_ms": int(time.time() * 1000),
        }

    def record_cache_hit(self) -> None:
        with self._lock:
            self._state["cache_hits"] += 1
            self._touch()

    def record_cache_miss(self) -> None:
        with self._lock:
            self._state["cache_misses"] += 1
            self._touch()

    def record_disk_load(self) -> None:
        with self._lock:
            self._state["nodes_loaded_from_disk"] += 1
            self._touch()

    def record_node_evaluated(self) -> None:
        with self._lock:
            self._state["nodes_evaluated"] += 1
            self._touch()

    def record_tree_depth(self, depth: int) -> None:
        with self._lock:
            if depth > self._state["max_tree_depth_seen"]:
                self._state["max_tree_depth_seen"] = depth
            self._touch()

    def record_retrieval_latency(self, latency_ms: int) -> None:
        with self._lock:
            self._state["retrieval_count"] += 1
            self._state["last_retrieval_latency_ms"] = latency_ms
            count = self._state["retrieval_count"]
            prev_avg = float(self._state["avg_retrieval_latency_ms"])
            self._state["avg_retrieval_latency_ms"] = (
                ((prev_avg * (count - 1)) + latency_ms) / count
            )
            self._touch()

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            hits = int(self._state["cache_hits"])
            misses = int(self._state["cache_misses"])
            total = hits + misses
            hit_rate = (hits / total) if total else 0.0
            return {
                **self._state,
                "cache_hit_rate": round(hit_rate, 4),
            }

    def _touch(self) -> None:
        self._state["last_updated_epoch_ms"] = int(time.time() * 1000)


metrics_collector = MetricsCollector()

from __future__ import annotations

import asyncio
from threading import Lock
from typing import Any, Dict, List


class TraversalEventBus:
    """
    Lightweight in-process pub/sub for traversal events.
    """

    def __init__(self) -> None:
        self._lock = Lock()
        self._subscribers: List[asyncio.Queue] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        with self._lock:
            self._loop = loop

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=2000)
        with self._lock:
            self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        with self._lock:
            if queue in self._subscribers:
                self._subscribers.remove(queue)

    def publish(self, payload: Dict[str, Any]) -> None:
        with self._lock:
            loop = self._loop
            subscribers = list(self._subscribers)
        if not loop or not subscribers:
            return
        for queue in subscribers:
            loop.call_soon_threadsafe(self._put_nowait_safe, queue, payload)

    @staticmethod
    def _put_nowait_safe(queue: asyncio.Queue, payload: Dict[str, Any]) -> None:
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass


traversal_events = TraversalEventBus()

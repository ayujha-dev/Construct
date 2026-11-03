"""WebSocket event manager."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import WebSocket

from bert.agents.pipeline import EventSink


class WebSocketManager:
    """Adapt the pipeline event sink to connected FastAPI sockets."""

    def __init__(self) -> None:
        self.sink = EventSink()
        self._sockets: dict[WebSocket, Callable[[dict[str, Any]], Awaitable[None]]] = {}

    async def connect(self, socket: WebSocket) -> None:
        await socket.accept()

        async def send(event: dict[str, Any]) -> None:
            await socket.send_json(event)

        self._sockets[socket] = send
        self.sink.add(send)

    def disconnect(self, socket: WebSocket) -> None:
        listener = self._sockets.pop(socket, None)
        if listener is not None:
            self.sink.remove(listener)

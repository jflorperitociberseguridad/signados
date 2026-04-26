"""
WebRTC signaling over WebSocket.

Each room is identified by a 6-character upper-case alphanumeric code.
Up to 2 peers can join a room — first is "signer", second is "listener",
but the role is informational; signaling is symmetric.

Messages are JSON envelopes: {"type": "...", "data": {...}}
- "join": {role}
- "peer-joined" / "peer-left": broadcast to the room when peers come/go
- "offer" / "answer" / "ice": forwarded to the other peer
- "translation": broadcast translation result (e.g., signer -> listener)
- "subtitle": real-time text overlay
- "ping" / "pong": keepalive
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import secrets
import string
from typing import Dict, Set

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("signlanguage.rtc")


# In-memory room registry. Acceptable for single-replica deployments;
# for multi-replica scale, swap for Redis Pub/Sub.
_rooms: Dict[str, Set[WebSocket]] = {}
_lock = asyncio.Lock()

ROOM_RE = re.compile(r"^[A-Z0-9]{4,12}$")


def generate_room_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    # Avoid easily-confusable characters
    alphabet = alphabet.replace("0", "").replace("O", "").replace("1", "").replace("I", "")
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def _broadcast(room: str, payload: dict, exclude: WebSocket | None = None) -> None:
    peers = list(_rooms.get(room, set()))
    msg = json.dumps(payload)
    for ws in peers:
        if ws is exclude:
            continue
        try:
            await ws.send_text(msg)
        except Exception:
            pass


async def _send(ws: WebSocket, payload: dict) -> None:
    try:
        await ws.send_text(json.dumps(payload))
    except Exception:
        pass


async def handle_signaling(ws: WebSocket, room: str) -> None:
    """Main signaling loop for a single peer in a room."""
    if not ROOM_RE.match(room):
        await ws.close(code=4400)
        return

    await ws.accept()

    async with _lock:
        bucket = _rooms.setdefault(room, set())
        if len(bucket) >= 4:
            await _send(ws, {"type": "error", "data": {"code": "room_full"}})
            await ws.close(code=4409)
            return
        bucket.add(ws)
        peer_count = len(bucket)

    await _send(ws, {"type": "joined", "data": {"room": room, "peers": peer_count}})
    # Notify others a peer arrived
    await _broadcast(room, {"type": "peer-joined", "data": {"peers": peer_count}}, exclude=ws)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            t = (msg or {}).get("type")
            data = (msg or {}).get("data") or {}

            if t in ("offer", "answer", "ice", "subtitle", "translation", "chat"):
                # Forward to the OTHER peers in the room
                await _broadcast(room, {"type": t, "data": data}, exclude=ws)
            elif t == "ping":
                await _send(ws, {"type": "pong", "data": {"t": data.get("t")}})
            elif t == "leave":
                break
            # Unknown types are silently dropped
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("rtc loop error: %s", exc)
    finally:
        async with _lock:
            bucket = _rooms.get(room, set())
            bucket.discard(ws)
            remaining = len(bucket)
            if not bucket:
                _rooms.pop(room, None)
        await _broadcast(room, {"type": "peer-left", "data": {"peers": remaining}})


def room_stats() -> dict:
    return {
        "rooms": len(_rooms),
        "peers": sum(len(s) for s in _rooms.values()),
    }

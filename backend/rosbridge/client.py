"""
Mission Control — RosBridge WebSocket Client
Maintains persistent connection to rosbridge_server running inside isaac-ros-main container.
All ROS2 communication passes through this client.
ROS2 is never installed locally — this is the exclusive interface.
"""

import asyncio
import json
import structlog
from typing import Any, Callable, Awaitable
from websockets.asyncio.client import connect, ClientConnection
from websockets.exceptions import ConnectionClosed

logger = structlog.get_logger(__name__)

MessageHandler = Callable[[dict], Awaitable[None]]


class RosBridgeClient:
    """
    Async WebSocket client for rosbridge v2 protocol.
    Handles subscriptions, publications, service calls, and parameter operations.
    """

    def __init__(self, url: str) -> None:
        self._url = url
        self._connection: ClientConnection | None = None
        self._subscriptions: dict[str, list[MessageHandler]] = {}
        self._pending_service_calls: dict[str, asyncio.Future] = {}
        self._op_id_counter = 0
        self._receive_task: asyncio.Task | None = None

    async def connect(self) -> None:
        self._connection = await connect(self._url)
        self._receive_task = asyncio.create_task(self._receive_loop())
        logger.info("rosbridge_client_connected", url=self._url)

    async def disconnect(self) -> None:
        if self._receive_task:
            self._receive_task.cancel()
        if self._connection:
            await self._connection.close()
        logger.info("rosbridge_client_disconnected")

    def _next_op_id(self) -> str:
        self._op_id_counter += 1
        return f"mc_{self._op_id_counter}"

    async def _send(self, message: dict) -> None:
        if self._connection is None:
            raise RuntimeError("RosBridge client not connected")
        await self._connection.send(json.dumps(message))

    async def _receive_loop(self) -> None:
        try:
            async for raw in self._connection:
                message = json.loads(raw)
                await self._dispatch(message)
        except ConnectionClosed:
            logger.warning("rosbridge_connection_closed")
        except asyncio.CancelledError:
            pass

    async def _dispatch(self, message: dict) -> None:
        op = message.get("op")

        if op == "publish":
            topic = message.get("topic")
            if topic in self._subscriptions:
                for handler in self._subscriptions[topic]:
                    await handler(message.get("msg", {}))

        elif op == "service_response":
            op_id = message.get("id")
            if op_id in self._pending_service_calls:
                future = self._pending_service_calls.pop(op_id)
                if not future.done():
                    future.set_result(message)

    async def subscribe(
        self,
        topic: str,
        msg_type: str,
        handler: MessageHandler,
        throttle_rate: int = 0,
    ) -> None:
        op_id = self._next_op_id()
        if topic not in self._subscriptions:
            self._subscriptions[topic] = []
            await self._send({
                "op": "subscribe",
                "id": op_id,
                "topic": topic,
                "type": msg_type,
                "throttle_rate": throttle_rate,
            })
        self._subscriptions[topic].append(handler)

    async def unsubscribe(self, topic: str) -> None:
        if topic in self._subscriptions:
            del self._subscriptions[topic]
            await self._send({"op": "unsubscribe", "topic": topic})

    async def publish(self, topic: str, msg_type: str, message: dict) -> None:
        await self._send({
            "op": "publish",
            "topic": topic,
            "type": msg_type,
            "msg": message,
        })

    async def call_service(
        self,
        service: str,
        service_type: str,
        args: dict,
        timeout: float = 10.0,
    ) -> dict[str, Any]:
        op_id = self._next_op_id()
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending_service_calls[op_id] = future
        await self._send({
            "op": "call_service",
            "id": op_id,
            "service": service,
            "type": service_type,
            "args": args,
        })
        return await asyncio.wait_for(future, timeout=timeout)

    async def get_topics(self) -> dict:
        return await self.call_service(
            service="/rosapi/topics",
            service_type="rosapi/Topics",
            args={},
        )

    async def get_nodes(self) -> dict:
        return await self.call_service(
            service="/rosapi/nodes",
            service_type="rosapi/Nodes",
            args={},
        )

    async def get_param(self, name: str) -> Any:
        result = await self.call_service(
            service="/rosapi/get_param",
            service_type="rosapi/GetParam",
            args={"name": name},
        )
        return result.get("value")

    async def set_param(self, name: str, value: Any) -> None:
        await self.call_service(
            service="/rosapi/set_param",
            service_type="rosapi/SetParam",
            args={"name": name, "value": json.dumps(value)},
        )

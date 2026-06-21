"""FastAPI gateway for streaming agent execution via WebSocket.

Clients connect to /ws/execute with a query parameter and receive real-time
events as the DAG executes (node_created, node_started, node_completed, etc).
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path
from typing import Callable

# Add src to path if not already there (for module execution)
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware

from flow import Executor
from schemas import ExecutorEvent

app = FastAPI(title="EAGV3 Executor API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.websocket("/ws/execute")
async def websocket_execute(
    websocket: WebSocket,
    query: str = Query(...),
    session_id: str | None = Query(None),
):
    """Execute agent query and stream events via WebSocket.

    Query parameter: `query` (required)
    Optional: `session_id` to resume a previous session

    Emits ExecutorEvent (JSON) objects:
    - node_created
    - node_started
    - node_completed
    - memory_hit
    - tool_call
    - cache_hit
    - executor_end

    Example client:
    ```
    ws = new WebSocket("ws://localhost:8000/ws/execute?query=hello");
    ws.onmessage = (e) => console.log(JSON.parse(e.data));
    ```
    """
    await websocket.accept()

    # Collect events in a queue
    event_queue: asyncio.Queue[ExecutorEvent] = asyncio.Queue()

    async def emit_event(event: ExecutorEvent) -> None:
        """Called by Executor to emit an event."""
        await event_queue.put(event)

    # Create executor and run query in background task
    executor = Executor()
    executor_task = asyncio.create_task(
        executor.run(query, session_id=session_id, event_emitter=emit_event)
    )

    try:
        # Forward events to WebSocket client
        while not executor_task.done():
            try:
                # Wait for either an event or executor completion
                event = await asyncio.wait_for(event_queue.get(), timeout=1.0)
                await websocket.send_json(event.model_dump())
            except asyncio.TimeoutError:
                # Check if executor is done
                if executor_task.done():
                    break
                # Otherwise, loop and try again
                continue

        # Drain any remaining events
        while not event_queue.empty():
            event = event_queue.get_nowait()
            await websocket.send_json(event.model_dump())

        # Wait for executor to complete and capture result
        result = await executor_task
        print(f"[api] executor completed: {result[:100]}")

    except Exception as e:
        print(f"[api] error: {e}")
        await websocket.send_json({
            "type": "error",
            "message": str(e),
            "timestamp": time.time(),
        })
    finally:
        await websocket.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

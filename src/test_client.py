"""Simple WebSocket test client for streaming executor.

Usage:
    python test_client.py "hello"
    python test_client.py "what is 2 + 2"
"""

import asyncio
import json
import sys
from typing import AsyncIterator

try:
    import websockets
except ImportError:
    print("websockets not installed. Install with: pip install websockets")
    sys.exit(1)


async def connect_executor(query: str, base_url: str = "ws://127.0.0.1:8000") -> AsyncIterator[dict]:
    """Connect to executor WebSocket and stream events.

    Args:
        query: Query string to execute
        base_url: WebSocket server base URL

    Yields:
        Event dictionaries as they arrive
    """
    ws_url = f"{base_url}/ws/execute?query={query}"
    try:
        async with websockets.connect(ws_url) as ws:
            while True:
                try:
                    msg = await ws.recv()
                    event = json.loads(msg)
                    yield event
                except websockets.exceptions.ConnectionClosed:
                    break
    except ConnectionRefusedError:
        print(f"Error: Could not connect to {ws_url}")
        print("Make sure the API server is running:")
        print("  python -m src.api")
        sys.exit(1)


async def main():
    if len(sys.argv) < 2:
        query = "hello"
    else:
        query = " ".join(sys.argv[1:])

    print(f"Connecting to executor WebSocket for query: {query}\n")
    print("Events:")
    print("=" * 70)

    async for event in connect_executor(query):
        print(json.dumps(event, indent=2))
        print("-" * 70)

    print("\nExecution completed!")


if __name__ == "__main__":
    asyncio.run(main())

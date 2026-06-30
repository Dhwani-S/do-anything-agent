"""Bridge to llm_gatewayV9.

Auto-starts the gateway on port 8109 if it is not already up, then
re-exports the gateway `LLM` client and a module-level `embed()` helper.
This keeps the agent-side API stable while Session 9 browser and vision
capabilities are provided by the new gateway runtime.
"""

from __future__ import annotations
import shutil
import sys
import subprocess
import time
from pathlib import Path

import httpx

# Sibling layout: src/ and gateway/ at workspace root. Resolve the gateway
# dir relative to this file so the package works from any checkout path.
# Override with EAGV3_GATEWAY_DIR if you move things.
import os as _os
GATEWAY_V9_DIR = Path(
    _os.environ.get("EAGV3_GATEWAY_DIR")
    or (Path(__file__).resolve().parent.parent / "gateway")
).resolve()
GATEWAY_URL = "http://localhost:8109"


def _is_up() -> bool:
    try:
        httpx.get(f"{GATEWAY_URL}/v1/routers", timeout=2.0)
        return True
    except Exception:
        return False


def ensure_gateway() -> None:
    """Start V9 if it is not already running. Idempotent."""
    if _is_up():
        return
    if not GATEWAY_V9_DIR.exists():
        raise RuntimeError(
            f"Gateway V9 directory not found at {GATEWAY_V9_DIR}. "
            "Build llm_gatewayV9 before running the agent."
        )
        print(f"[gateway] launching llm_gatewayV9 from {GATEWAY_V9_DIR}")

    uv_bin = shutil.which("uv")
    if uv_bin:
        cmd = [uv_bin, "run", "main.py"]
    else:
        # Fallback: run gateway with current Python interpreter.
        cmd = [sys.executable, "main.py"]

    subprocess.Popen(
        cmd,
        cwd=str(GATEWAY_V9_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(45):
        time.sleep(1)
        if _is_up():
            print(f"[gateway] up on {GATEWAY_URL}")
            return
    raise RuntimeError(f"Gateway V9 failed to start within 45s. Check {GATEWAY_V9_DIR}")


# Load V9's client.py without polluting sys.path. The gateway dir has its
# own `schemas.py`, which would shadow ours if we put it on the path.
import importlib.util as _importlib_util

_client_path = GATEWAY_V9_DIR / "client.py"
if _client_path.exists():
    _spec = _importlib_util.spec_from_file_location("llm_gatewayV9_client", _client_path)
    _mod = _importlib_util.module_from_spec(_spec)
    _spec.loader.exec_module(_mod)
    LLM = _mod.LLM
else:
    LLM = None  # populated once V9 is built; importers should ensure_gateway() first


def embed(text: str, task_type: str = "retrieval_document") -> dict:
    """Compute an embedding for `text` via the gateway's embed endpoint.

    Returns the full response dict: `{embedding, dim, model, provider,
    latency_ms, ...}`. The chosen embedding model is fixed at the gateway
    level. Changing it invalidates every FAISS index built against the old
    vectors, so callers should treat the model as a project-level constant.
    """
    ensure_gateway()
    if LLM is None:
        raise RuntimeError(
            "Gateway V9 client unavailable. Confirm llm_gatewayV9/client.py exists."
        )
    return LLM().embed(text, task_type=task_type)


# Backward-compat alias for older imports.
GATEWAY_V8_DIR = GATEWAY_V9_DIR

__all__ = ["ensure_gateway", "LLM", "GATEWAY_URL", "GATEWAY_V9_DIR", "GATEWAY_V8_DIR", "embed"]

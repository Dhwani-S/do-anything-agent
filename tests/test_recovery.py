"""Unit tests for recovery.classify_failure + plan_recovery.

These tests pin the keyword-matching classifier against the actual
error strings the gateway emits today. If a future gateway upgrade
changes the prose (e.g. "Service Unavailable" → "Backend Unavailable"),
the test fails LOUDLY rather than silently routing a transient error
through an upstream-failure re-plan path that would burn tokens.

Review round-3 #2: the classifier is keyword-based; without these
tests a gateway-prose change is a silent regression.

The strings below were captured from real httpx / FastAPI error
output in the V8 gateway logs and from the providers.py error
branches.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Tests live at workspace root while code lives under src/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import pytest
from recovery import build_recovery_report, classify_failure, handle_critic_verdict, plan_recovery, reusable_upstream_ids
from schemas import AgentResult


# Strings the gateway actually emits today. Each tuple is
# (error_text, expected_reason).
GATEWAY_TRANSIENT_STRINGS = [
    "exception: HTTPStatusError: Server error '503 Service Unavailable' for url 'http://localhost:8108/v1/chat'",
    "exception: HTTPStatusError: Server error '502 Bad Gateway' for url 'http://localhost:8108/v1/chat'",
    "exception: HTTPStatusError: Server error '504 Gateway Timeout' for url 'http://localhost:8108/v1/chat'",
    "Timeout occurred while waiting for provider reply",
    "Connection reset by peer",
    "httpx.ConnectError: All connection attempts failed",
]

GATEWAY_VALIDATION_STRINGS = [
    "planner: 2 malformed NodeSpec(s) emitted.\n  - successor={'foo': 'bar'} error=...",
    "1 validation error for NodeSpec\nskill\n  Field required",
    "researcher: malformed nodes emitted",
]

GENUINE_UPSTREAM_STRINGS = [
    "no code in upstream coder output",
    "file not found: /nonexistent/path.txt",
    "(not found)",
    "Tavily API returned no results for query 'xyz'",
    "gateway_blocked: captcha marker on https://example.com",
    "",  # empty error text — treat as upstream by convention
]


@pytest.mark.parametrize("err", GATEWAY_TRANSIENT_STRINGS)
def test_classify_transient(err: str) -> None:
    assert classify_failure(err) == "transient", f"misclassified transient: {err!r}"


@pytest.mark.parametrize("err", GATEWAY_VALIDATION_STRINGS)
def test_classify_validation(err: str) -> None:
    assert classify_failure(err) == "validation_error", f"misclassified validation: {err!r}"


@pytest.mark.parametrize("err", GENUINE_UPSTREAM_STRINGS)
def test_classify_upstream(err: str) -> None:
    assert classify_failure(err) == "upstream_failure", f"misclassified upstream: {err!r}"


def test_plan_recovery_transient_skips() -> None:
    d = plan_recovery(failed_skill="researcher",
                      error_text=GATEWAY_TRANSIENT_STRINGS[0],
                      failed_node_id="n:42")
    assert d.action == "skip"
    assert d.reason == "transient"
    assert d.failure_report is None


def test_plan_recovery_validation_skips() -> None:
    d = plan_recovery(failed_skill="planner",
                      error_text=GATEWAY_VALIDATION_STRINGS[0],
                      failed_node_id="n:1")
    assert d.action == "skip"
    assert d.reason == "validation_error"


def test_plan_recovery_planner_failure_never_replans() -> None:
    # Even genuinely-upstream "planner failed" never triggers a re-plan;
    # that would loop forever on a stubborn planner.
    d = plan_recovery(failed_skill="planner",
                      error_text="no code in upstream coder output",
                      failed_node_id="n:1")
    assert d.action == "skip"
    assert d.reason == "upstream_failure"


def test_plan_recovery_upstream_failure_replans() -> None:
    d = plan_recovery(failed_skill="researcher",
                      error_text="Tavily returned no results",
                      failed_node_id="n:7")
    assert d.action == "replan"
    assert d.reason == "upstream_failure"
    assert d.failure_report and "n:7" in d.failure_report
    assert "researcher" in d.failure_report


def test_plan_recovery_gateway_blocked_browser_replans() -> None:
    d = plan_recovery(
        failed_skill="browser",
        error_text="gateway_blocked: cloudflare marker on https://target.site",
        failed_node_id="n:9",
    )
    assert d.action == "replan"
    assert d.reason == "upstream_failure"
    assert d.failure_report and "gateway_blocked" in d.failure_report


# ── Critic-fail splice tests (review round-3 #3) ────────────────────────────
#
# The end-to-end haiku run did exercise the Critic node, but the Critic
# returned `pass`. The fail-splice path therefore wasn't visible at the
# orchestrator level. These tests drive `handle_critic_verdict` directly
# with a synthetic fail-verdict AgentResult so the splice mechanics are
# verified without depending on an LLM disagreeing with itself.

class _StubGraph:
    """Minimal stand-in for flow.Graph used by handle_critic_verdict."""

    def __init__(self):
        from networkx import DiGraph
        self.g = DiGraph()
        self._added: list[tuple[str, str, list[str], dict]] = []
        self._marks: list[tuple[str, str]] = []
        self._counter = 0

    def mark(self, nid: str, status: str) -> None:
        if nid in self.g.nodes:
            self.g.nodes[nid]["status"] = status
        self._marks.append((nid, status))

    def add_node(self, skill: str, inputs: list, metadata: dict | None = None) -> str:
        self._counter += 1
        nid = f"n:rec{self._counter}"
        self.g.add_node(nid, skill=skill, inputs=list(inputs),
                        metadata=dict(metadata or {}), status="pending")
        self._added.append((nid, skill, list(inputs), dict(metadata or {})))
        return nid


def _seed_critic_branch(graph: _StubGraph, *, auto_inserted: bool):
    """Build target → critic → child shape. When auto_inserted=True the
    critic carries target/child in metadata (as Graph.extend_from sets);
    when False the critic was emitted explicitly by the Planner and the
    handler must derive both from graph structure."""
    graph.g.add_node("n:u", skill="researcher", status="complete",
                     inputs=[], metadata={"question": "facts for haiku"},
                     result=AgentResult(success=True, agent_name="researcher",
                                        output={"answer": "AI themes and imagery"}))
    graph.g.add_node("n:t", skill="distiller", status="complete",
                     inputs=["n:u"], metadata={"label": "draft"},
                     result=AgentResult(success=True, agent_name="distiller",
                                        output={"draft": "AI writes bright lines"}))
    graph.g.add_node("n:c", skill="critic", status="complete",
                     inputs=["n:t"],
                     metadata={"target": "n:t", "child": "n:f"} if auto_inserted else {})
    graph.g.add_node("n:f", skill="formatter", status="pending",
                     inputs=["n:c"], metadata={})
    graph.g.add_edge("n:u", "n:t")
    graph.g.add_edge("n:t", "n:c")
    graph.g.add_edge("n:c", "n:f")


def _fail_result() -> AgentResult:
    return AgentResult(success=True, agent_name="critic",
                       output={"verdict": "fail", "rationale": "syllables off"})


def test_critic_fail_auto_inserted_splices_planner_and_skips_child() -> None:
    g = _StubGraph()
    _seed_critic_branch(g, auto_inserted=True)
    recovered: dict[str, bool] = {}
    cap: list[str] = []
    handled = handle_critic_verdict("n:c", _fail_result(), g, recovered, cap)
    assert handled is True
    assert ("n:f", "skipped") in g._marks, "child was not skipped"
    added_skills = [a[1] for a in g._added]
    assert added_skills == ["planner"], "expected exactly one planner recovery"
    assert g._added[0][2] == ["USER_QUERY", "n:u"]
    assert g._added[0][3]["recovers"] == "n:t"
    assert g._added[0][3]["recovery_reason"] == "critic_fail"
    report = g._added[0][3]["failure_report"]
    assert "RECOVERY_REPORT" in report
    assert "critic_rationale: syllables off" in report
    assert "completed_reusable_upstream_nodes" in report
    assert "id=n:u" in report
    assert "do not recreate the full DAG" in report
    assert cap == []


def test_critic_fail_explicit_critic_derives_target_and_child_from_graph() -> None:
    g = _StubGraph()
    _seed_critic_branch(g, auto_inserted=False)
    recovered: dict[str, bool] = {}
    cap: list[str] = []
    handled = handle_critic_verdict("n:c", _fail_result(), g, recovered, cap)
    assert handled is True
    assert ("n:f", "skipped") in g._marks
    assert g._added[0][3]["recovers"] == "n:t"
    assert cap == []


def test_critic_fail_cap_fires_on_second_failure_for_same_target() -> None:
    g = _StubGraph()
    _seed_critic_branch(g, auto_inserted=True)
    recovered: dict[str, bool] = {"n:t": True}  # already recovered once
    cap: list[str] = []
    handled = handle_critic_verdict("n:c", _fail_result(), g, recovered, cap)
    assert handled is True
    assert cap == ["n:t"], "cap-hit should be surfaced for future logging"
    assert [a[1] for a in g._added] == [], "no second planner should be queued"


def test_critic_pass_returns_false_no_splice() -> None:
    g = _StubGraph()
    _seed_critic_branch(g, auto_inserted=True)
    recovered: dict[str, bool] = {}
    cap: list[str] = []
    pass_result = AgentResult(success=True, agent_name="critic",
                              output={"verdict": "pass", "rationale": "ok"})
    handled = handle_critic_verdict("n:c", pass_result, g, recovered, cap)
    assert handled is False
    assert g._added == []
    assert cap == []


def test_build_recovery_report_for_node_failure_reuses_completed_inputs() -> None:
    g = _StubGraph()
    g.g.add_node("n:r", skill="researcher", status="complete",
                 inputs=[], metadata={"question": "population of Paris"},
                 result=AgentResult(success=True, agent_name="researcher",
                                    output={"population": "about 2.1 million"}))
    g.g.add_node("n:x", skill="formatter", status="failed",
                 inputs=["n:r"], metadata={"label": "out"},
                 result=AgentResult(success=False, agent_name="formatter",
                                    error="missing ranking"))
    g.g.add_edge("n:r", "n:x")

    report = build_recovery_report(
        graph=g,
        failed_node_id="n:x",
        base_report="node=n:x skill=formatter reason=upstream_failure error=missing ranking",
        reason="upstream_failure",
    )

    assert "RECOVERY_REPORT" in report
    assert "failed_or_rejected_node" in report
    assert "id=n:x" in report
    assert "completed_reusable_upstream_nodes" in report
    assert "id=n:r" in report
    assert "population of Paris" in report
    assert reusable_upstream_ids(g, "n:x") == ["n:r"]

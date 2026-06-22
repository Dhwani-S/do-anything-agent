"""Failure classification and recovery decisions for the orchestrator.

Two surfaces:

  - `classify_failure(error_text)` buckets a failure into one of
    {transient, validation_error, upstream_failure} so the orchestrator
    can tell apart a gateway 503 from a malformed plan from a genuine
    upstream miss (NOTES_RUNS round-2 review P0 #3).

  - `plan_recovery(...)` is the predicate the Executor consults to
    decide WHAT to do with a failure: "skip", "replan", or "critic_fail".
    Concentrating the if/elif tree here keeps `flow.Executor.run`
    focused on graph mechanics and lets the recovery policy be unit-
    tested in isolation.

The orchestrator imports `plan_recovery` and acts on the returned
`RecoveryDecision` — it does not branch on classifier output itself.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Literal

RecoveryReason = Literal["transient", "validation_error", "upstream_failure"]
RecoveryAction = Literal["skip", "replan", "critic_fail"]


def classify_failure(error_text: str) -> RecoveryReason:
    e = (error_text or "").lower()
    if not e:
        return "upstream_failure"
    if "exceptiongroup" in e or "unhandled errors in a taskgroup" in e:
        return "transient"
    if "malformed" in e or "validationerror" in e or "validation error" in e:
        return "validation_error"
    transient_markers = (
        "503", "502", "504",
        "timeout", "timed out",
        "connection", "connectionerror", "httpstatuserror",
        "service unavailable", "bad gateway", "gateway timeout",
    )
    if any(m in e for m in transient_markers):
        return "transient"
    return "upstream_failure"


@dataclass(frozen=True)
class RecoveryDecision:
    action: RecoveryAction
    reason: RecoveryReason
    note: str
    failure_report: str | None = None  # populated when action == "replan"


def _clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + " ..."


def _compact(value, *, limit: int = 900) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
    except TypeError:
        text = str(value)
    return _clip(text.replace("\n", " "), limit)


def _walk_predecessors(graph, nid: str) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    def visit(cur: str) -> None:
        if cur not in graph.g.nodes:
            return
        for pred in graph.g.predecessors(cur):
            if pred in seen:
                continue
            seen.add(pred)
            visit(pred)
            ordered.append(pred)

    visit(nid)
    return ordered


def _node_line(graph, nid: str, *, include_output: bool) -> str:
    data = graph.g.nodes[nid]
    metadata = data.get("metadata") or {}
    parts = [
        f"id={nid}",
        f"skill={data.get('skill')}",
        f"status={data.get('status')}",
    ]
    label = metadata.get("label")
    question = metadata.get("question")
    if label:
        parts.append(f"label={label}")
    if question:
        parts.append(f"question={_clip(str(question), 220)}")
    result = data.get("result")
    if include_output and result is not None:
        output = getattr(result, "output", None)
        if output:
            parts.append(f"output={_compact(output)}")
        error = getattr(result, "error", None)
        if error:
            parts.append(f"error={_clip(str(error), 500)}")
    return " | ".join(parts)


def reusable_upstream_ids(graph, nid: str, *, limit: int = 10) -> list[str]:
    reusable = []
    for upstream_id in _walk_predecessors(graph, nid):
        if upstream_id not in graph.g.nodes:
            continue
        data = graph.g.nodes[upstream_id]
        if data.get("status") != "complete":
            continue
        if data.get("skill") in {"planner", "critic"}:
            continue
        reusable.append(upstream_id)
    return reusable[-limit:]


def build_recovery_report(
    *,
    graph,
    failed_node_id: str,
    base_report: str | None,
    reason: str,
    critic_node_id: str | None = None,
    skipped_child_id: str | None = None,
    critic_rationale: str | None = None,
) -> str:
    """Create the compact context shown to a recovery Planner.

    The key Session-8 behavior is graph repair, not graph replacement. This
    report gives the Planner enough concrete node ids to reuse completed
    upstream work instead of rediscovering the whole user query.
    """
    lines = [
        "RECOVERY_REPORT",
        f"reason: {reason}",
        "planner_directive: repair only the failed branch; do not recreate the full DAG; reuse completed node ids below as inputs when their data is still valid; do not emit another planner node.",
    ]
    if base_report:
        lines.append(f"failure: {base_report}")
    if critic_node_id:
        lines.append(f"critic_node: {critic_node_id}")
    if critic_rationale:
        lines.append(f"critic_rationale: {_clip(str(critic_rationale), 800)}")
    if skipped_child_id:
        lines.append(f"skipped_downstream_child: {skipped_child_id}")
    if failed_node_id in graph.g.nodes:
        lines.append("failed_or_rejected_node:")
        lines.append("  - " + _node_line(graph, failed_node_id, include_output=True))
        reusable = reusable_upstream_ids(graph, failed_node_id)
        if reusable:
            lines.append("completed_reusable_upstream_nodes:")
            for upstream_id in reusable:
                lines.append("  - " + _node_line(graph, upstream_id, include_output=True))
        else:
            lines.append("completed_reusable_upstream_nodes: none")
    return _clip("\n".join(lines), 7000)


def plan_recovery(
    *,
    failed_skill: str,
    error_text: str,
    failed_node_id: str,
) -> RecoveryDecision:
    """Decide what to do with a node failure that is NOT a critic-verdict
    failure. The critic-fail path is handled separately in the Executor
    because it needs access to the critic node's metadata (target, child)
    and a per-target cap that is run-scoped state — this function is the
    purely-local predicate.

    Decision table (all coverage):
      reason=transient                          → skip (gateway already retried)
      reason=validation_error                   → skip (prompt bug, not runtime)
      reason=upstream_failure, failed=planner   → skip (would loop on Planner errors)
      reason=upstream_failure, failed=other     → replan
    """
    reason = classify_failure(error_text)
    if reason == "transient":
        return RecoveryDecision(
            action="skip", reason=reason,
            note="transient gateway error; gateway retry exhausted, not re-planning",
        )
    if reason == "validation_error":
        return RecoveryDecision(
            action="skip", reason=reason,
            note="validation error (malformed NodeSpec); fix the prompt, not the run",
        )
    if failed_skill in {"coder", "sandbox_executor"}:
        return RecoveryDecision(
            action="skip", reason=reason,
            note="code/sandbox failure; not re-planning the whole graph",
        )
    if failed_skill == "planner":
        return RecoveryDecision(
            action="skip", reason=reason,
            note="planner-itself failure; not re-planning a planner",
        )
    fr = (f"node={failed_node_id} skill={failed_skill} reason={reason} "
          f"error={error_text}")
    return RecoveryDecision(
        action="replan", reason=reason,
        note="upstream failure; queueing planner recovery",
        failure_report=fr,
    )


def handle_critic_verdict(nid: str, result, graph, recovered_branches: dict,
                          cap_hit: list) -> bool:
    """Critic-fail policy (P1 #5). Returns True when the caller should skip
    the normal `extend_from` (because the Critic emitted `fail` and we
    handled it by splicing a recovery Planner). False on `pass`.

    Two shapes of Critic appear in S8: auto-inserted Critics (Graph.extend_from
    inserts one whenever a `critic:true` skill has outgoing edges) which
    carry `target` + `child` in metadata, and Planner-emitted Critics
    which do not — for the latter we derive both from graph structure.
    """
    if (result.output or {}).get("verdict", "pass") != "fail":
        return False
    md = graph.g.nodes[nid].get("metadata") or {}
    target_nid = md.get("target")
    child_nid = md.get("child")
    if not target_nid:
        for inp in graph.g.nodes[nid]["inputs"]:
            if inp.startswith("n:") and inp in graph.g.nodes:
                target_nid = inp; break
    if not child_nid:
        succs = list(graph.g.successors(nid))
        child_nid = succs[0] if succs else None
    if child_nid and child_nid in graph.g.nodes:
        graph.mark(child_nid, "skipped")
    if target_nid and not recovered_branches.get(target_nid):
        recovered_branches[target_nid] = True
        rationale = (result.output or {}).get("rationale", "(no rationale)")
        base_report = (
            f"critic failed target={target_nid} child={child_nid} "
            f"rationale={rationale}"
        )
        fr = build_recovery_report(
            graph=graph,
            failed_node_id=target_nid,
            base_report=base_report,
            reason="critic_fail",
            critic_node_id=nid,
            skipped_child_id=child_nid,
            critic_rationale=str(rationale),
        )
        recovery_inputs = ["USER_QUERY", *reusable_upstream_ids(graph, target_nid)]
        rec_nid = graph.add_node("planner", inputs=recovery_inputs,
                                 metadata={"failure_report": fr,
                                           "recovers": target_nid,
                                           "recovery_reason": "critic_fail"})
        print(f"  ↪ critic-fail recovery: planner node {rec_nid} for {target_nid}")
    elif target_nid:
        cap_hit.append(target_nid)
        print(f"  ↪ critic-fail on {target_nid} already recovered once; "
              f"CAP HIT — branch skipped, final will reflect missing data")
    return True

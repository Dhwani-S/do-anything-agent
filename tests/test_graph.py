from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from flow import Graph
from schemas import AgentResult, NodeSpec


class _Registry:
    def __init__(self):
        self.defs = {
            "planner": SimpleNamespace(internal_successors=[], critic=False),
            "coder": SimpleNamespace(internal_successors=["sandbox_executor"], critic=False),
            "formatter": SimpleNamespace(internal_successors=[], critic=False),
            "critic": SimpleNamespace(internal_successors=[], critic=False),
            "sandbox_executor": SimpleNamespace(internal_successors=[], critic=False),
        }

    def get(self, name: str):
        return self.defs[name]


def test_coder_internal_successor_rewires_existing_formatter_child() -> None:
    graph = Graph()
    planner_id = graph.add_node("planner", inputs=["USER_QUERY"])
    planner_result = AgentResult(
        success=True,
        agent_name="planner",
        successors=[
            NodeSpec(skill="coder", inputs=["USER_QUERY"], metadata={"label": "score"}),
            NodeSpec(skill="formatter", inputs=["n:score", "USER_QUERY"], metadata={"label": "out"}),
        ],
    )

    graph.extend_from(planner_id, planner_result, registry=_Registry())
    coder_id = "n:2"
    formatter_id = "n:3"

    assert graph.g.has_edge(coder_id, formatter_id)
    assert graph.g.nodes[formatter_id]["inputs"] == [coder_id, "USER_QUERY"]

    coder_result = AgentResult(success=True, agent_name="coder", output={"code": "print(1)"})
    added = graph.extend_from(coder_id, coder_result, registry=_Registry())
    sandbox_id = added[0]

    assert graph.g.nodes[sandbox_id]["skill"] == "sandbox_executor"
    assert graph.g.nodes[sandbox_id]["inputs"] == [coder_id]
    assert not graph.g.has_edge(coder_id, formatter_id)
    assert graph.g.has_edge(coder_id, sandbox_id)
    assert graph.g.has_edge(sandbox_id, formatter_id)
    assert graph.g.nodes[formatter_id]["inputs"] == [sandbox_id, "USER_QUERY"]


def test_coder_internal_successor_rewires_existing_critic_child() -> None:
    graph = Graph()
    coder_id = graph.add_node("coder", inputs=["USER_QUERY"])
    critic_id = graph.add_node("critic", inputs=[coder_id], metadata={"question": "verify code output"})

    added = graph.extend_from(
        coder_id,
        AgentResult(success=True, agent_name="coder", output={"code": "print(1)"}),
        registry=_Registry(),
    )
    sandbox_id = added[0]

    assert not graph.g.has_edge(coder_id, critic_id)
    assert graph.g.has_edge(sandbox_id, critic_id)
    assert graph.g.nodes[critic_id]["inputs"] == [sandbox_id]


def test_explicit_critic_gates_sibling_formatter() -> None:
    graph = Graph()
    planner_id = graph.add_node("planner", inputs=["USER_QUERY"])
    planner_result = AgentResult(
        success=True,
        agent_name="planner",
        successors=[
            NodeSpec(skill="coder", inputs=["USER_QUERY"], metadata={"label": "score"}),
            NodeSpec(skill="critic", inputs=["n:score"], metadata={"label": "check"}),
            NodeSpec(skill="formatter", inputs=["USER_QUERY", "n:score"], metadata={"label": "out"}),
        ],
    )

    graph.extend_from(planner_id, planner_result, registry=_Registry())
    coder_id = "n:2"
    critic_id = "n:3"
    formatter_id = "n:4"

    assert graph.g.has_edge(coder_id, critic_id)
    assert not graph.g.has_edge(coder_id, formatter_id)
    assert graph.g.has_edge(critic_id, formatter_id)
    assert graph.g.nodes[formatter_id]["inputs"] == ["USER_QUERY", critic_id]


def test_coder_sandbox_and_explicit_critic_gate_formatter() -> None:
    graph = Graph()
    planner_id = graph.add_node("planner", inputs=["USER_QUERY"])
    planner_result = AgentResult(
        success=True,
        agent_name="planner",
        successors=[
            NodeSpec(skill="coder", inputs=["USER_QUERY"], metadata={"label": "score"}),
            NodeSpec(skill="critic", inputs=["n:score"], metadata={"label": "check"}),
            NodeSpec(skill="formatter", inputs=["USER_QUERY", "n:score"], metadata={"label": "out"}),
        ],
    )
    graph.extend_from(planner_id, planner_result, registry=_Registry())

    added = graph.extend_from(
        "n:2",
        AgentResult(success=True, agent_name="coder", output={"code": "print(1)"}),
        registry=_Registry(),
    )
    sandbox_id = added[0]

    assert graph.g.nodes[sandbox_id]["skill"] == "sandbox_executor"
    assert graph.g.has_edge("n:2", sandbox_id)
    assert graph.g.has_edge(sandbox_id, "n:3")
    assert graph.g.has_edge("n:3", "n:4")
    assert not graph.g.has_edge(sandbox_id, "n:4")
    assert graph.g.nodes["n:3"]["inputs"] == [sandbox_id]
    assert graph.g.nodes["n:4"]["inputs"] == ["USER_QUERY", "n:3"]
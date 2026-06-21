import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import { useExecutorStore } from '../store/executorStore';
import type { DAGNode } from '../types/executor';

// ── Status colours ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<DAGNode['status'], string> = {
  pending:  'border-slate-600 bg-slate-800 text-slate-400',
  running:  'border-violet-500 bg-violet-900/40 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.4)]',
  complete: 'border-emerald-500 bg-emerald-900/30 text-emerald-300',
  failed:   'border-red-500 bg-red-900/30 text-red-300',
};

const STATUS_DOT: Record<DAGNode['status'], string> = {
  pending:  'bg-slate-500',
  running:  'bg-violet-400 animate-pulse',
  complete: 'bg-emerald-400',
  failed:   'bg-red-400',
};

// ── Custom node renderer ───────────────────────────────────────────────────────
function SkillNode({ data }: NodeProps) {
  const node = data as DAGNode;
  return (
    <div className={clsx('px-3 py-2 rounded-xl border text-xs min-w-[120px] transition-all', STATUS_COLOR[node.status])}>
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !border-slate-400" />
      <div className="flex items-center gap-2">
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[node.status])} />
        <span className="font-mono font-semibold truncate">{node.skill_name}</span>
      </div>
      <div className="text-[10px] opacity-60 mt-0.5 font-mono">{node.id}</div>
      {node.duration_s !== undefined && (
        <div className="text-[10px] opacity-50 mt-0.5">{node.duration_s.toFixed(1)}s</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !border-slate-400" />
    </div>
  );
}

const nodeTypes = { skillNode: SkillNode };

// ── Layout: simple top-down tiers ─────────────────────────────────────────────
function buildLayout(dagNodes: DAGNode[], nodeOrder: string[]) {
  const COL_W = 200;
  const ROW_H = 100;
  const orderedNodes = nodeOrder
    .map((id) => dagNodes.find((n) => n.id === id))
    .filter(Boolean) as DAGNode[];

  // Group nodes by "depth" heuristically: nodes with no inputs = row 0, others = row 1+
  const rows: DAGNode[][] = [];
  const placed = new Set<string>();

  orderedNodes.forEach((n) => {
    const validInputs = n.inputs.filter((i) => i.startsWith('n:'));
    if (validInputs.length === 0) {
      if (!rows[0]) rows[0] = [];
      rows[0].push(n);
    } else {
      const parentDepth = validInputs.reduce((max, inp) => {
        const parentRow = rows.findIndex((r) => r.some((rn) => rn.id === inp));
        return Math.max(max, parentRow >= 0 ? parentRow : 0);
      }, 0);
      const targetRow = parentDepth + 1;
      if (!rows[targetRow]) rows[targetRow] = [];
      rows[targetRow].push(n);
    }
    placed.add(n.id);
  });

  const rfNodes = rows.flatMap((row, rowIdx) =>
    row.map((n, colIdx) => ({
      id: n.id,
      type: 'skillNode',
      position: {
        x: colIdx * COL_W - ((row.length - 1) * COL_W) / 2 + 300,
        y: rowIdx * ROW_H + 40,
      },
      data: n,
    })),
  );

  const rfEdges: { id: string; source: string; target: string; animated: boolean; style: object }[] = [];
  orderedNodes.forEach((n) => {
    n.inputs.filter((i) => i.startsWith('n:')).forEach((src) => {
      rfEdges.push({
        id: `${src}->${n.id}`,
        source: src,
        target: n.id,
        animated: n.status === 'running',
        style: { stroke: '#4b5563', strokeWidth: 1.5 },
      });
    });
  });

  return { rfNodes, rfEdges };
}

export function GraphView() {
  const nodes = useExecutorStore((s) => s.nodes);
  const nodeOrder = useExecutorStore((s) => s.nodeOrder);

  const dagNodes = useMemo(() => Object.values(nodes), [nodes]);
  const { rfNodes, rfEdges } = useMemo(
    () => buildLayout(dagNodes, nodeOrder),
    [dagNodes, nodeOrder],
  );

  if (dagNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        DAG graph appears here during execution
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#1e2030" gap={20} />
      <Controls />
      <MiniMap nodeColor={(n) => {
        const status = (n.data as DAGNode).status;
        return status === 'complete' ? '#10b981' : status === 'running' ? '#8b5cf6' : status === 'failed' ? '#ef4444' : '#475569';
      }} />
    </ReactFlow>
  );
}

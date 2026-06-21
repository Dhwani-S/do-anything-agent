import { useCallback, useMemo, useState } from 'react';
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
import { X } from 'lucide-react';
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
  const node = data as DAGNode & { onClick?: () => void };
  return (
    <div
      onClick={node.onClick}
      className={clsx(
        'px-3 py-2 rounded-xl border text-xs min-w-[130px] transition-all cursor-pointer hover:brightness-125',
        STATUS_COLOR[node.status],
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !border-slate-400" />
      <div className="flex items-center gap-2">
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[node.status])} />
        <span className="font-mono font-semibold truncate">{node.skill_name}</span>
      </div>
      <div className="text-[10px] opacity-60 mt-0.5 font-mono">{node.id}</div>
      {node.duration_s !== undefined && (
        <div className="text-[10px] opacity-50 mt-0.5">{node.duration_s.toFixed(1)}s</div>
      )}
      {node.tokens_in !== undefined && node.tokens_in > 0 && (
        <div className="text-[9px] opacity-40 mt-0.5">{node.tokens_in}↑ {node.tokens_out}↓ tok</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !border-slate-400" />
    </div>
  );
}

const nodeTypes = { skillNode: SkillNode };

// ── Node detail panel ─────────────────────────────────────────────────────────
function NodeDetail({ node, onClose }: { node: DAGNode; onClose: () => void }) {
  const eventLog = useExecutorStore((s) => s.eventLog);
  const startedEvent = eventLog.find(
    (e) => e.type === 'node_started' && 'node_id' in e && e.node_id === node.id,
  );
  const completedEvent = eventLog.find(
    (e) => e.type === 'node_completed' && 'node_id' in e && e.node_id === node.id,
  );

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 z-10 flex flex-col text-xs overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
        <div>
          <p className="font-mono font-semibold text-slate-200">{node.skill_name}</p>
          <p className="text-[10px] text-slate-500 font-mono">{node.id}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status */}
        <section>
          <p className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Status</p>
          <span className={clsx(
            'px-2 py-0.5 rounded-md font-mono text-[11px]',
            node.status === 'complete' ? 'bg-emerald-900/40 text-emerald-300' :
            node.status === 'running'  ? 'bg-violet-900/40 text-violet-300' :
            node.status === 'failed'   ? 'bg-red-900/40 text-red-300' :
            'bg-slate-800 text-slate-400'
          )}>{node.status}</span>
          {node.duration_s !== undefined && (
            <span className="ml-2 text-slate-500">{node.duration_s.toFixed(2)}s</span>
          )}
        </section>

        {/* Inputs (upstream dependencies) */}
        <section>
          <p className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Inputs (Dependencies)</p>
          {node.inputs.length === 0 ? (
            <p className="text-slate-600 italic">none</p>
          ) : (
            <ul className="space-y-1">
              {node.inputs.map((inp, i) => (
                <li key={i} className="font-mono bg-slate-800 px-2 py-1 rounded text-slate-300">{inp}</li>
              ))}
            </ul>
          )}
        </section>

        {/* Tokens */}
        {(node.tokens_in !== undefined || node.tokens_out !== undefined) && (
          <section>
            <p className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Token Usage</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800 rounded-lg p-2">
                <p className="text-[9px] text-slate-500">Input</p>
                <p className="text-blue-400 font-mono">{(node.tokens_in ?? 0).toLocaleString()}</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-2">
                <p className="text-[9px] text-slate-500">Output</p>
                <p className="text-emerald-400 font-mono">{(node.tokens_out ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </section>
        )}

        {/* Error */}
        {node.error && (
          <section>
            <p className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Error</p>
            <p className="bg-red-900/30 border border-red-800 rounded-lg p-2 text-red-300 font-mono leading-relaxed">{node.error}</p>
          </section>
        )}

        {/* Timeline */}
        {startedEvent && (
          <section>
            <p className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Timeline</p>
            <div className="space-y-1 font-mono text-[10px] text-slate-400">
              {'timestamp' in startedEvent && <p>Started: {new Date((startedEvent as any).timestamp * 1000).toLocaleTimeString()}</p>}
              {completedEvent && 'timestamp' in completedEvent && (<p>Completed: {new Date((completedEvent as any).timestamp * 1000).toLocaleTimeString()}</p>)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── Layout: simple top-down tiers ─────────────────────────────────────────────
function buildLayout(
  dagNodes: DAGNode[],
  nodeOrder: string[],
  onNodeClick: (id: string) => void,
) {
  const COL_W = 200;
  const ROW_H = 110;
  const orderedNodes = nodeOrder
    .map((id) => dagNodes.find((n) => n.id === id))
    .filter(Boolean) as DAGNode[];

  // Build implicit chain: if node has no n: inputs, its implicit predecessor
  // is the previous node in creation order (planner → formatter case).
  const rows: DAGNode[][] = [];

  orderedNodes.forEach((n, idx) => {
    const explicitInputs = n.inputs.filter((i) => i.startsWith('n:'));
    if (explicitInputs.length === 0) {
      // Root-level: row 0 for first node, else row after implicit predecessor
      if (idx === 0) {
        if (!rows[0]) rows[0] = [];
        rows[0].push(n);
      } else {
        // Place one row below the previous node
        const prevId = orderedNodes[idx - 1]?.id;
        const prevRow = prevId ? rows.findIndex((r) => r.some((rn) => rn.id === prevId)) : 0;
        const targetRow = (prevRow >= 0 ? prevRow : 0) + 1;
        if (!rows[targetRow]) rows[targetRow] = [];
        rows[targetRow].push(n);
      }
    } else {
      const parentDepth = explicitInputs.reduce((max, inp) => {
        const parentRow = rows.findIndex((r) => r.some((rn) => rn.id === inp));
        return Math.max(max, parentRow >= 0 ? parentRow : 0);
      }, 0);
      const targetRow = parentDepth + 1;
      if (!rows[targetRow]) rows[targetRow] = [];
      rows[targetRow].push(n);
    }
  });

  const rfNodes = rows.flatMap((row, rowIdx) =>
    row.map((n, colIdx) => ({
      id: n.id,
      type: 'skillNode',
      position: {
        x: colIdx * COL_W - ((row.length - 1) * COL_W) / 2 + 300,
        y: rowIdx * ROW_H + 40,
      },
      data: { ...n, onClick: () => onNodeClick(n.id) },
    })),
  );

  const rfEdges: {
    id: string;
    source: string;
    target: string;
    animated: boolean;
    style: object;
    label?: string;
  }[] = [];

  orderedNodes.forEach((n, idx) => {
    const explicitInputs = n.inputs.filter((i) => i.startsWith('n:'));

    if (explicitInputs.length > 0) {
      // Explicit data-dependency edges
      explicitInputs.forEach((src) => {
        rfEdges.push({
          id: `${src}->${n.id}`,
          source: src,
          target: n.id,
          animated: n.status === 'running',
          style: { stroke: '#7c3aed', strokeWidth: 1.5 },
          label: 'data',
        });
      });
    } else if (idx > 0) {
      // Implicit sequential edge from previous node
      const prevId = orderedNodes[idx - 1].id;
      rfEdges.push({
        id: `${prevId}~~>${n.id}`,
        source: prevId,
        target: n.id,
        animated: n.status === 'running',
        style: { stroke: '#475569', strokeWidth: 1.5, strokeDasharray: '4 3' },
        label: 'seq',
      });
    }
  });

  return { rfNodes, rfEdges };
}
export function GraphView() {
  const nodes = useExecutorStore((s) => s.nodes);
  const nodeOrder = useExecutorStore((s) => s.nodeOrder);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const dagNodes = useMemo(() => Object.values(nodes), [nodes]);
  const { rfNodes, rfEdges } = useMemo(
    () => buildLayout(dagNodes, nodeOrder, setSelectedNodeId),
    [dagNodes, nodeOrder],
  );

  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null;

  if (dagNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        DAG graph appears here during execution
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => setSelectedNodeId(null)}
      >
        <Background color="#1e2030" gap={20} />
        <Controls />
        <MiniMap nodeColor={(n) => {
          const status = (n.data as DAGNode).status;
          return status === 'complete' ? '#10b981' : status === 'running' ? '#8b5cf6' : status === 'failed' ? '#ef4444' : '#475569';
        }} />
      </ReactFlow>

      {selectedNode && (
        <NodeDetail node={selectedNode} onClose={() => setSelectedNodeId(null)} />
      )}

      <div className="absolute bottom-2 left-2 flex gap-3 text-[10px] text-slate-500 pointer-events-none">
        <span className="flex items-center gap-1"><span className="w-4 h-px bg-violet-500 inline-block" /> data edge</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px bg-slate-500 inline-block border-dashed border-t border-slate-500" /> seq edge</span>
        <span className="text-slate-600">click node to inspect</span>
      </div>
    </div>
  );
}

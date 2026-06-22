import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useExecutorStore } from '../store/executorStore';
import type { DAGNode, ExecutorEvent } from '../types/executor';

// ── Status colours ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<DAGNode['status'], string> = {
  pending:  'border-[var(--border)] bg-[var(--bg-soft)] text-[var(--text-dim)]',
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
  const node = data as unknown as DAGNode & { onClick?: () => void };
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
const REPLAY_INTERVAL_MS = 650;

function buildReplayGraph(events: ExecutorEvent[]) {
  const nodes: Record<string, DAGNode> = {};
  const nodeOrder: string[] = [];

  events.forEach((event) => {
    switch (event.type) {
      case 'node_created': {
        nodes[event.node_id] = {
          id: event.node_id,
          skill_name: event.skill_name,
          status: 'pending',
          inputs: event.inputs,
          metadata: event.metadata ?? {},
          started_at: event.timestamp,
        };
        if (!nodeOrder.includes(event.node_id)) {
          nodeOrder.push(event.node_id);
        }
        break;
      }
      case 'node_updated': {
        nodes[event.node_id] = {
          ...(nodes[event.node_id] ?? { id: event.node_id, status: 'pending' }),
          skill_name: event.skill_name,
          inputs: event.inputs,
          metadata: event.metadata ?? {},
        };
        if (!nodeOrder.includes(event.node_id)) {
          nodeOrder.push(event.node_id);
        }
        break;
      }
      case 'node_started': {
        nodes[event.node_id] = {
          ...(nodes[event.node_id] ?? { id: event.node_id, inputs: [] }),
          skill_name: event.skill_name,
          status: 'running',
          started_at: event.timestamp,
        };
        if (!nodeOrder.includes(event.node_id)) {
          nodeOrder.push(event.node_id);
        }
        break;
      }
      case 'node_completed': {
        nodes[event.node_id] = {
          ...(nodes[event.node_id] ?? { id: event.node_id, inputs: [] }),
          skill_name: event.skill_name,
          status: event.status,
          duration_s: event.duration_s,
          tokens_in: event.tokens_in,
          tokens_out: event.tokens_out,
          error: event.error ?? undefined,
          prompt: event.prompt,
          output: event.output,
          artifacts: event.artifacts,
          successors: event.successors,
          provider: event.provider,
          cost: event.cost,
          completed_at: event.timestamp,
        };
        if (!nodeOrder.includes(event.node_id)) {
          nodeOrder.push(event.node_id);
        }
        break;
      }
      default:
        break;
    }
  });

  return { nodes, nodeOrder };
}

// ── Node detail panel ─────────────────────────────────────────────────────────
function formatJson(value: unknown) {
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array[${value.length}]`;
  return typeof value;
}

function extractPromptInputs(prompt?: string | null): unknown | null {
  if (!prompt) return null;
  const marker = '\nINPUTS:';
  const index = prompt.lastIndexOf(marker);
  if (index < 0) return null;
  const raw = prompt.slice(index + marker.length).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { parse_error: 'The rendered INPUTS block was truncated or is not valid JSON.', raw };
  }
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="text-[var(--text-faint)] uppercase tracking-wider text-[10px]">{title}</p>
      {children}
    </section>
  );
}

function CodeBlock({ value, empty = 'not available yet' }: { value: unknown; empty?: string }) {
  const text = typeof value === 'string' ? value : formatJson(value);
  if (!text) {
    return <p className="text-[var(--text-faint)] italic">{empty}</p>;
  }
  return (
    <pre className="max-h-80 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-app)]/65 p-2 font-mono text-[10px] leading-relaxed text-[var(--text-main)] whitespace-pre-wrap break-words">
      {text}
    </pre>
  );
}

function NodeDetail({ node, events, onClose }: { node: DAGNode; events: ExecutorEvent[]; onClose: () => void }) {
  const nodeEvents = events.filter((event) => 'node_id' in event && event.node_id === node.id);
  const startedEvent = nodeEvents.find((event) => event.type === 'node_started');
  const completedEvent = nodeEvents.find((event) => event.type === 'node_completed');
  const relatedEvents = nodeEvents.filter(
    (event) => event.type === 'memory_hit' || event.type === 'tool_call' || event.type === 'cache_hit',
  );
  const promptInputs = extractPromptInputs(node.prompt);
  const metadataEntries = Object.entries(node.metadata ?? {});

  return (
    <div className="absolute right-0 top-0 bottom-0 z-10 flex w-[460px] max-w-[48%] flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-elev)] text-xs shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <div>
          <p className="font-mono font-semibold text-[var(--text-main)]">{node.skill_name}</p>
          <p className="text-[10px] text-[var(--text-faint)] font-mono">{node.id}</p>
        </div>
        <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text-main)]">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <DetailSection title="Status">
          <span className={clsx(
            'px-2 py-0.5 rounded-md font-mono text-[11px]',
            node.status === 'complete' ? 'bg-emerald-900/40 text-emerald-300' :
            node.status === 'running'  ? 'bg-violet-900/40 text-violet-300' :
            node.status === 'failed'   ? 'bg-red-900/40 text-red-300' :
            'bg-slate-800 text-slate-400'
          )}>{node.status}</span>
          {node.duration_s !== undefined && (
            <span className="ml-2 text-[var(--text-faint)]">{node.duration_s.toFixed(2)}s</span>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="rounded-md bg-[var(--bg-soft)] p-2">
              <p className="text-[9px] text-[var(--text-faint)]">Skill</p>
              <p className="font-mono text-[var(--text-main)]">{node.skill_name}</p>
            </div>
            <div className="rounded-md bg-[var(--bg-soft)] p-2">
              <p className="text-[9px] text-[var(--text-faint)]">Provider</p>
              <p className="font-mono text-[var(--text-main)]">{node.provider || 'not available'}</p>
            </div>
          </div>
        </DetailSection>

        <DetailSection title="Planner Metadata">
          {metadataEntries.length === 0 ? (
            <p className="text-[var(--text-faint)] italic">none</p>
          ) : (
            <div className="space-y-2">
              {metadataEntries.map(([key, value]) => (
                <div key={key} className="rounded-md bg-[var(--bg-soft)] p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-[var(--text-main)]">{key}</span>
                    <span className="font-mono text-[9px] text-[var(--text-faint)]">{valueType(value)}</span>
                  </div>
                  <CodeBlock value={value} />
                </div>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Input References">
          {node.inputs.length === 0 ? (
            <p className="text-[var(--text-faint)] italic">none</p>
          ) : (
            <ul className="space-y-1">
              {node.inputs.map((inp, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded bg-[var(--bg-soft)] px-2 py-1 font-mono text-[var(--text-main)]">
                  <span>{inp}</span>
                  <span className="text-[9px] text-[var(--text-faint)]">
                    {inp === 'USER_QUERY' ? 'query' : inp.startsWith('n:') ? 'upstream node' : inp.startsWith('art:') ? 'artifact' : 'literal'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Resolved Content Passed To Skill">
          <CodeBlock value={promptInputs} empty={node.status === 'pending' || node.status === 'running' ? 'available after the node renders its prompt' : 'not available'} />
        </DetailSection>

        {(node.tokens_in !== undefined || node.tokens_out !== undefined) && (
          <DetailSection title="Token Usage">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[var(--bg-soft)] rounded-lg p-2">
                <p className="text-[9px] text-[var(--text-faint)]">Input</p>
                <p className="text-blue-400 font-mono">{(node.tokens_in ?? 0).toLocaleString()}</p>
              </div>
              <div className="bg-[var(--bg-soft)] rounded-lg p-2">
                <p className="text-[9px] text-[var(--text-faint)]">Output</p>
                <p className="text-emerald-400 font-mono">{(node.tokens_out ?? 0).toLocaleString()}</p>
              </div>
            </div>
            {node.cost !== undefined && node.cost > 0 && (
              <p className="font-mono text-[10px] text-[var(--text-dim)]">Cost: {node.cost}</p>
            )}
          </DetailSection>
        )}

        {node.error && (
          <DetailSection title="Error">
            <p className="bg-red-900/30 border border-red-800 rounded-lg p-2 text-red-300 font-mono leading-relaxed">{node.error}</p>
          </DetailSection>
        )}

        <DetailSection title="Output">
          <CodeBlock value={node.output} empty={node.status === 'pending' || node.status === 'running' ? 'waiting for completion' : 'no output'} />
        </DetailSection>

        <DetailSection title="Artifacts">
          {node.artifacts && node.artifacts.length > 0 ? (
            <ul className="space-y-1">
              {node.artifacts.map((artifact) => (
                <li key={artifact} className="rounded bg-[var(--bg-soft)] px-2 py-1 font-mono text-[var(--text-main)]">{artifact}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--text-faint)] italic">none</p>
          )}
        </DetailSection>

        <DetailSection title="Successors Emitted">
          <CodeBlock value={node.successors} empty="none" />
        </DetailSection>

        <DetailSection title="Rendered Prompt">
          <CodeBlock value={node.prompt} empty={node.status === 'pending' || node.status === 'running' ? 'available after the node completes' : 'not available'} />
        </DetailSection>

        <DetailSection title="Related Events">
          {relatedEvents.length === 0 ? (
            <p className="text-[var(--text-faint)] italic">none</p>
          ) : (
            <div className="space-y-2">
              {relatedEvents.map((event, index) => (
                <div key={`${event.type}-${index}`} className="rounded-md bg-[var(--bg-soft)] p-2">
                  <p className="mb-1 font-mono text-[10px] text-[var(--brand)]">{event.type}</p>
                  <CodeBlock value={event} />
                </div>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Timeline">
          <div className="space-y-1 font-mono text-[10px] text-[var(--text-dim)]">
            {startedEvent && <p>Started: {new Date(startedEvent.timestamp * 1000).toLocaleTimeString()}</p>}
            {completedEvent && <p>Completed: {new Date(completedEvent.timestamp * 1000).toLocaleTimeString()}</p>}
            {!startedEvent && !completedEvent && <p className="italic text-[var(--text-faint)]">no start event yet</p>}
          </div>
        </DetailSection>

        <DetailSection title="Raw Node Events">
          <CodeBlock value={nodeEvents} empty="none" />
        </DetailSection>
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
  if (dagNodes.length === 0) return { rfNodes: [], rfEdges: [] };

  const COL_W = 240;
  const ROW_H = 160;

  const rootId = nodeOrder[0];
  // Set of node IDs actually present in this render
  const knownIds = new Set(dagNodes.map((n) => n.id));

  // ── Step 1: Build adjacency including virtual spawn edges ──
  // Spawned nodes (no n:* inputs, not the root) get a virtual dependency
  // on the root so they appear one level below the planner.
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();

  for (const n of dagNodes) {
    if (!children.has(n.id)) children.set(n.id, []);
    // Only count parents that actually exist in the current node set;
    // during live streaming some referenced parents may not have arrived yet.
    const explicitParents = n.inputs.filter((i) => i.startsWith('n:') && knownIds.has(i));
    if (explicitParents.length === 0 && n.id !== rootId && rootId && knownIds.has(rootId)) {
      // Virtual spawn dependency on root
      parents.set(n.id, [rootId]);
      if (!children.has(rootId)) children.set(rootId, []);
      children.get(rootId)!.push(n.id);
    } else {
      parents.set(n.id, explicitParents);
      for (const p of explicitParents) {
        if (!children.has(p)) children.set(p, []);
        children.get(p)!.push(n.id);
      }
    }
  }

  // ── Step 2: Compute depth via longest-path (Kahn's algorithm) ──
  const depth = new Map<string, number>();
  const inDeg = new Map<string, number>();
  for (const n of dagNodes) {
    inDeg.set(n.id, (parents.get(n.id) ?? []).length);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) {
      queue.push(id);
      depth.set(id, 0);
    }
  }

  let iterations = 0;
  const maxIterations = dagNodes.length * dagNodes.length; // safety cap
  while (queue.length > 0 && iterations < maxIterations) {
    iterations++;
    const cur = queue.shift()!;
    const curDepth = depth.get(cur) ?? 0;
    for (const child of children.get(cur) ?? []) {
      if (!inDeg.has(child)) continue; // child not in current nodes
      const prev = depth.get(child) ?? 0;
      depth.set(child, Math.max(prev, curDepth + 1));
      inDeg.set(child, (inDeg.get(child) ?? 1) - 1);
      if (inDeg.get(child) === 0) queue.push(child);
    }
  }

  // Fallback for unreachable nodes (missing parents not yet in store)
  let maxReachedDepth = 0;
  for (const d of depth.values()) {
    if (d > maxReachedDepth) maxReachedDepth = d;
  }
  for (const n of dagNodes) {
    if (!depth.has(n.id)) depth.set(n.id, maxReachedDepth + 1);
  }

  // ── Step 3: Group into rows ──
  const maxDepth = Math.max(maxReachedDepth, ...Array.from(depth.values()));
  const rows: DAGNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const n of dagNodes) {
    rows[depth.get(n.id)!].push(n);
  }

  // ── Step 4: Barycenter ordering to minimize edge crossings ──
  const colPosition = new Map<string, number>();
  const orderIndex = new Map(nodeOrder.map((id, i) => [id, i]));
  rows[0]?.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
  rows[0]?.forEach((n, i) => colPosition.set(n.id, i));

  for (let r = 1; r <= maxDepth; r++) {
    if (!rows[r]) continue;
    const bary = (n: DAGNode): number => {
      const pars = parents.get(n.id) ?? [];
      if (pars.length === 0) return orderIndex.get(n.id) ?? 0;
      const sum = pars.reduce((s, p) => s + (colPosition.get(p) ?? 0), 0);
      return sum / pars.length;
    };
    rows[r].sort((a, b) => bary(a) - bary(b));
    rows[r].forEach((n, i) => colPosition.set(n.id, i));
  }

  // ── Step 5: Position nodes ──
  const rfNodes = rows.flatMap((row, rowIdx) =>
    row.map((n, colIdx) => ({
      id: n.id,
      type: 'skillNode',
      position: {
        x: colIdx * COL_W - ((row.length - 1) * COL_W) / 2 + 400,
        y: rowIdx * ROW_H + 40,
      },
      data: { ...n, onClick: () => onNodeClick(n.id) },
    })),
  );

  // ── Step 6: Build edges ──
  const rfEdges: {
    id: string;
    source: string;
    target: string;
    animated: boolean;
    style: object;
    label?: string;
  }[] = [];

  for (const n of dagNodes) {
    const explicitInputs = n.inputs.filter((i) => i.startsWith('n:') && knownIds.has(i));

    if (explicitInputs.length > 0) {
      for (const src of explicitInputs) {
        rfEdges.push({
          id: `${src}->${n.id}`,
          source: src,
          target: n.id,
          animated: n.status === 'running',
          style: { stroke: '#7c3aed', strokeWidth: 1.5 },
          label: 'data',
        });
      }
    } else if (rootId && n.id !== rootId && knownIds.has(rootId)) {
      rfEdges.push({
        id: `${rootId}~~>${n.id}`,
        source: rootId,
        target: n.id,
        animated: n.status === 'running',
        style: { stroke: '#475569', strokeWidth: 1.5, strokeDasharray: '4 3' },
        label: 'spawn',
      });
    }
  }

  return { rfNodes, rfEdges };
}
export function GraphView() {
  const liveNodes = useExecutorStore((s) => s.nodes);
  const liveNodeOrder = useExecutorStore((s) => s.nodeOrder);
  const liveEvents = useExecutorStore((s) => s.eventLog);
  const currentRun = useExecutorStore((s) => s.currentRun);
  const runHistory = useExecutorStore((s) => s.runHistory);
  const selectedRunId = useExecutorStore((s) => s.selectedRunId);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayEventCount, setReplayEventCount] = useState(0);

  const selectedRun = useMemo(() => {
    if (!selectedRunId) return null;
    if (currentRun?.id === selectedRunId) return currentRun;
    return runHistory.find((run) => run.id === selectedRunId) ?? null;
  }, [currentRun, runHistory, selectedRunId]);

  const nodes = selectedRun?.id === currentRun?.id
    ? liveNodes
    : selectedRun?.graphNodes ?? liveNodes;
  const nodeOrder = selectedRun?.id === currentRun?.id
    ? liveNodeOrder
    : selectedRun?.graphNodeOrder ?? liveNodeOrder;
  const graphEvents = selectedRun?.id === currentRun?.id
    ? liveEvents
    : selectedRun?.events ?? liveEvents;
  const replaySourceEvents = selectedRun?.events ?? graphEvents;
  const canReplay = replaySourceEvents.some(
    (event) => event.type === 'node_created' || event.type === 'node_updated' || event.type === 'node_started' || event.type === 'node_completed',
  );
  const replayEvents = useMemo(
    () => replaySourceEvents.slice(0, replayEventCount),
    [replaySourceEvents, replayEventCount],
  );
  const replayGraph = useMemo(() => buildReplayGraph(replayEvents), [replayEvents]);
  const showingReplay = replayEventCount > 0 || isReplaying;
  const displayNodes = showingReplay ? replayGraph.nodes : nodes;
  const displayNodeOrder = showingReplay ? replayGraph.nodeOrder : nodeOrder;
  const displayEvents = showingReplay ? replayEvents : graphEvents;

  const dagNodes = useMemo(() => Object.values(displayNodes), [displayNodes]);
  const { rfNodes, rfEdges } = useMemo(
    () => buildLayout(dagNodes, displayNodeOrder, setSelectedNodeId),
    [dagNodes, displayNodeOrder],
  );

  const selectedNode = selectedNodeId ? displayNodes[selectedNodeId] : null;

  useEffect(() => {
    setIsReplaying(false);
    setReplayEventCount(0);
    setSelectedNodeId(null);
  }, [selectedRunId]);

  useEffect(() => {
    if (!isReplaying) return;

    if (replayEventCount >= replaySourceEvents.length) {
      setIsReplaying(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setReplayEventCount((count) => Math.min(count + 1, replaySourceEvents.length));
    }, REPLAY_INTERVAL_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isReplaying, replayEventCount, replaySourceEvents.length]);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  if (dagNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-faint)] text-sm">
        DAG graph appears here during execution
      </div>
    );
  }

  const renderGraphCanvas = (fullscreen = false) => (
    <div className="relative h-full w-full">
      <ReactFlow
        key={fullscreen ? 'fullscreen' : 'inline'}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => setSelectedNodeId(null)}
      >
        <Background color="var(--border)" gap={20} />
        <Controls />
        <MiniMap nodeColor={(n) => {
          const status = (n.data as unknown as DAGNode).status;
          return status === 'complete' ? '#10b981' : status === 'running' ? '#8b5cf6' : status === 'failed' ? '#ef4444' : '#475569';
        }}
        maskColor="rgba(7, 11, 22, 0.65)"
        nodeStrokeColor="rgba(228, 235, 255, 0.55)"
        nodeBorderRadius={10}
        pannable
        zoomable
        style={{
          background: 'var(--bg-elev)',
          border: fullscreen ? '0' : '1px solid var(--border)',
          borderRadius: fullscreen ? 0 : 8,
        }} />
      </ReactFlow>

      {selectedNode && (
        <NodeDetail node={selectedNode} events={displayEvents} onClose={() => setSelectedNodeId(null)} />
      )}

      {selectedRun && (
        <div className="absolute top-2 left-2 max-w-[45%] rounded-md border border-[var(--border)] bg-[var(--bg-elev)]/88 px-2 py-1 text-[10px] text-[var(--text-dim)] pointer-events-none">
          <span className="text-[var(--brand)]">selected query:</span> {selectedRun.query.slice(0, 90)}{selectedRun.query.length > 90 ? '...' : ''}
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex gap-3 text-[10px] text-[var(--text-faint)] pointer-events-none">
        <span className="flex items-center gap-1"><span className="w-4 h-px bg-violet-500 inline-block" /> data edge</span>
        <span className="flex items-center gap-1"><span className="w-4 h-px bg-[var(--text-faint)] inline-block border-dashed border-t border-[var(--text-faint)]" /> spawn edge</span>
        <span className="text-[var(--text-faint)]">click node to inspect</span>
      </div>
    </div>
  );

  const startReplay = () => {
    if (!canReplay) return;
    setSelectedNodeId(null);
    setReplayEventCount(1);
    setIsReplaying(true);
  };

  const toggleReplay = () => {
    if (!canReplay) return;
    setSelectedNodeId(null);
    if (isReplaying) {
      setIsReplaying(false);
      return;
    }
    if (replayEventCount === 0 || replayEventCount >= replaySourceEvents.length) {
      setReplayEventCount(1);
    }
    setIsReplaying(true);
  };

  const resetReplay = () => {
    setIsReplaying(false);
    setReplayEventCount(0);
    setSelectedNodeId(null);
  };

  const renderReplayControls = (fullscreen = false) => {
    if (!canReplay) return null;

    return (
      <div className={clsx(
        'absolute z-30 flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/95 p-1 shadow-xl',
        fullscreen ? 'right-16 top-4' : 'right-14 top-3',
      )}>
        <button
          type="button"
          onClick={showingReplay ? toggleReplay : startReplay}
          className="flex h-8 items-center gap-1.5 rounded px-2 text-[11px] font-medium text-[var(--text-dim)] transition hover:bg-[var(--bg-accent)] hover:text-[var(--text-main)]"
          aria-label={isReplaying ? 'Pause DAG replay' : 'Replay DAG graph'}
          title={isReplaying ? 'Pause replay' : 'Replay graph'}
        >
          {isReplaying ? <Pause size={14} /> : <Play size={14} />}
          <span>{isReplaying ? 'Pause' : 'Replay'}</span>
        </button>
        {showingReplay && (
          <button
            type="button"
            onClick={resetReplay}
            className="flex h-8 w-8 items-center justify-center rounded text-[var(--text-dim)] transition hover:bg-[var(--bg-accent)] hover:text-[var(--text-main)]"
            aria-label="Reset DAG replay"
            title="Reset replay"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    );
  };

  const fullscreenGraph = isFullscreen
    ? createPortal(
        <div className="fixed inset-0 z-[9999] bg-[var(--bg-app)]">
          {renderGraphCanvas(true)}
          {renderReplayControls(true)}
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/95 text-[var(--text-dim)] shadow-xl transition hover:border-[var(--brand)] hover:text-[var(--text-main)]"
            aria-label="Close fullscreen DAG graph"
            title="Close fullscreen"
          >
            <Minimize2 size={17} />
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div className="relative h-full w-full">
        {renderGraphCanvas()}
        {renderReplayControls()}
        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-soft)]/92 text-[var(--text-dim)] shadow-lg transition hover:border-[var(--brand)] hover:text-[var(--text-main)]"
          aria-label="Open DAG graph fullscreen"
          title="Open fullscreen"
        >
          <Maximize2 size={15} />
        </button>
      </div>

      {fullscreenGraph}
    </>
  );
}

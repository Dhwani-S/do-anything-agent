import { useExecutorStore } from '../store/executorStore';
import { Zap } from 'lucide-react';

export function TokenTracker() {
  const { in: tokIn, out: tokOut } = useExecutorStore((s) => s.tokenTotals);
  const nodes = useExecutorStore((s) => s.nodes);
  const nodeOrder = useExecutorStore((s) => s.nodeOrder);
  const sessionId = useExecutorStore((s) => s.sessionId);

  const nodeList = nodeOrder.map((id) => nodes[id]).filter(Boolean);

  return (
    <div className="p-3 overflow-y-auto h-full space-y-4">
      {/* Session summary */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Tokens In" value={tokIn} color="text-blue-400" />
        <Stat label="Tokens Out" value={tokOut} color="text-emerald-400" />
        <Stat label="Total Tokens" value={tokIn + tokOut} color="text-violet-400" />
        <Stat label="Nodes Run" value={nodeList.filter(n => n.status === 'complete').length} color="text-slate-300" />
      </div>

      {sessionId && (
        <p className="text-[10px] text-slate-600 font-mono">session: {sessionId}</p>
      )}

      {/* Per-node breakdown */}
      {nodeList.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">
            Per-node breakdown
          </p>
          <div className="space-y-1.5">
            {nodeList.map((n) => (
              <div key={n.id} className="flex items-center gap-2 text-xs">
                <span
                  className={
                    n.status === 'complete'
                      ? 'text-emerald-400'
                      : n.status === 'running'
                      ? 'text-violet-400'
                      : n.status === 'failed'
                      ? 'text-red-400'
                      : 'text-slate-500'
                  }
                >
                  ●
                </span>
                <span className="font-mono text-slate-400 w-16 truncate">{n.skill_name}</span>
                <span className="text-slate-500 tabular-nums">
                  {n.duration_s !== undefined ? `${n.duration_s.toFixed(1)}s` : '…'}
                </span>
                {(n.tokens_in !== undefined || n.tokens_out !== undefined) && (
                  <span className="text-slate-600 tabular-nums text-[10px]">
                    {n.tokens_in ?? 0}↑ {n.tokens_out ?? 0}↓
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {nodeList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-slate-600 text-sm gap-2">
          <Zap size={24} />
          <span>Token counts appear during execution</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}

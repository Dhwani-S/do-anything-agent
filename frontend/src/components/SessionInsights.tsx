import { useMemo } from 'react';
import { useExecutorStore } from '../store/executorStore';

function formatMs(ms?: number) {
  if (ms === undefined) return '--';
  return `${(ms / 1000).toFixed(2)}s`;
}

export function SessionInsights() {
  const runHistory = useExecutorStore((s) => s.runHistory);
  const currentRun = useExecutorStore((s) => s.currentRun);

  const runs = useMemo(() => {
    if (!currentRun) return runHistory;
    if (runHistory.some((run) => run.id === currentRun.id)) return runHistory;
    return [...runHistory, currentRun];
  }, [runHistory, currentRun]);

  const sessionSummary = useMemo(() => {
    const completed = runs.filter((run) => run.status === 'complete').length;
    const totalTokensIn = runs.reduce((acc, run) => acc + run.tokensIn, 0);
    const totalTokensOut = runs.reduce((acc, run) => acc + run.tokensOut, 0);
    const totalMemoryHits = runs.reduce((acc, run) => acc + run.memoryHits, 0);
    const averageLatencyMs = runs.length > 0
      ? Math.round(runs.reduce((acc, run) => acc + (run.responseTimeMs ?? 0), 0) / runs.length)
      : 0;

    return {
      count: runs.length,
      completed,
      totalTokens: totalTokensIn + totalTokensOut,
      totalMemoryHits,
      averageLatencyMs,
    };
  }, [runs]);

  const steps = useMemo(() => {
    if (!currentRun) return [];
    return Object.values(currentRun.steps).sort((left, right) => {
      const leftStartedAt = left.startedAt ?? Number.MAX_SAFE_INTEGER;
      const rightStartedAt = right.startedAt ?? Number.MAX_SAFE_INTEGER;
      if (leftStartedAt === rightStartedAt) return left.nodeId.localeCompare(right.nodeId);
      return leftStartedAt - rightStartedAt;
    });
  }, [currentRun]);

  return (
    <div className="p-4 overflow-y-auto h-full space-y-5">
      <section>
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] mb-3">Session Signal</p>
        <div className="space-y-3 border-l border-[var(--border)] pl-3">
          <Metric label="Queries" value={sessionSummary.count.toString()} accent="var(--brand)" amount={Math.min(sessionSummary.count * 16, 100)} />
          <Metric label="Completed" value={sessionSummary.completed.toString()} accent="var(--teal)" amount={sessionSummary.count ? (sessionSummary.completed / sessionSummary.count) * 100 : 0} />
          <Metric label="Tokens" value={sessionSummary.totalTokens.toLocaleString()} accent="var(--amber)" amount={Math.min(sessionSummary.totalTokens / 120, 100)} />
          <Metric label="Memory" value={sessionSummary.totalMemoryHits.toString()} accent="var(--violet)" amount={Math.min(sessionSummary.totalMemoryHits * 20, 100)} />
          <Metric label="Avg Time" value={formatMs(sessionSummary.averageLatencyMs)} accent="var(--rose)" amount={Math.min(sessionSummary.averageLatencyMs / 80, 100)} />
        </div>
      </section>

      <section>
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] mb-3">Current Query</p>
        {!currentRun ? (
          <Empty title="No query started" description="Run a prompt to see per-query telemetry here." />
        ) : (
          <div className="border-l-2 border-[var(--brand)] pl-3 py-1 space-y-3 flow-scan">
            <p className="text-xs text-[var(--text-main)] leading-relaxed">{currentRun.query}</p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-[11px]">
              <Badge label="Status" value={currentRun.status} accent="var(--brand)" />
              <Badge label="Response" value={formatMs(currentRun.responseTimeMs)} accent="var(--rose)" />
              <Badge label="Memory" value={currentRun.memoryHits.toString()} accent="var(--violet)" />
              <Badge label="Tokens" value={`${currentRun.tokensIn}↑ ${currentRun.tokensOut}↓`} accent="var(--amber)" />
              <Badge label="Steps" value={`${currentRun.nodeCompleted}/${currentRun.nodeCreated}`} accent="var(--teal)" />
              <Badge label="Failed" value={currentRun.nodeFailed.toString()} accent="var(--rose)" />
            </div>
          </div>
        )}
      </section>

      <section>
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] mb-3">Step Timeline</p>
        {steps.length === 0 ? (
          <Empty title="No step telemetry yet" description="Node timing, tokens, and memory-hit stats will appear as the DAG runs." />
        ) : (
          <div className="max-h-72 overflow-y-auto border-l border-[var(--border)] pl-3 space-y-3">
            {steps.map((step) => {
              const accent = step.status === 'failed' ? 'var(--rose)' : step.status === 'complete' ? 'var(--teal)' : 'var(--brand)';
              return (
                <div key={step.nodeId} className="relative text-[11px] float-in">
                  <span className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full activity-dot" style={{ background: accent }} />
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium truncate" title={step.skillName}>{step.skillName}</span>
                    <span style={{ color: accent }}>{step.status}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--bg-soft)] overflow-hidden">
                    <span
                      className="block h-full rounded-full meter-fill"
                      style={{
                        width: `${Math.max(8, Math.min((step.durationS ?? 0.4) * 22, 100))}%`,
                        background: accent,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex gap-3 text-[10px] text-[var(--text-faint)]">
                    <span>{step.durationS !== undefined ? `${step.durationS.toFixed(2)}s` : 'pending'}</span>
                    <span>{step.tokensIn}↑ {step.tokensOut}↓ tokens</span>
                    <span>{step.memoryHits} memory</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, accent, amount }: { label: string; value: string; accent: string; amount: number }) {
  return (
    <div className="grid grid-cols-[92px_1fr_72px] items-center gap-3 text-xs">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
      <div className="h-1.5 rounded-full bg-[var(--bg-soft)] overflow-hidden">
        <span className="block h-full rounded-full meter-fill" style={{ width: `${Math.max(4, amount)}%`, background: accent }} />
      </div>
      <p className="text-right font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Badge({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider">{label}</p>
      <p className="text-xs mt-0.5 font-semibold" style={{ color: accent }}>{value}</p>
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-l border-dashed border-[var(--border)] pl-3 py-2">
      <p className="text-xs font-medium">{title}</p>
      <p className="text-[11px] text-[var(--text-faint)] mt-1">{description}</p>
    </div>
  );
}

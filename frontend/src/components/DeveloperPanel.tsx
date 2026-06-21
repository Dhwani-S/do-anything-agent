import { useState } from 'react';
import { GraphView } from './GraphView';
import { MemoryHits } from './MemoryHits';
import { TokenTracker } from './TokenTracker';
import { SessionInsights } from './SessionInsights';
import { useExecutorStore } from '../store/executorStore';
import clsx from 'clsx';

type Tab = 'insights' | 'graph' | 'memory' | 'tokens' | 'events';

const TABS: { id: Tab; label: string }[] = [
  { id: 'insights', label: 'Insights' },
  { id: 'graph',  label: 'DAG Graph' },
  { id: 'memory', label: 'Memory Hits' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'events', label: 'Event Log' },
];

export function DeveloperPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('insights');
  const eventLog = useExecutorStore((s) => s.eventLog);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-elev)]">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--border)] bg-[var(--bg-elev)]/85 backdrop-blur-sm flex-shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'px-4 py-2.5 text-xs font-medium transition-colors border-b-2',
              activeTab === tab.id
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-transparent text-[var(--text-faint)] hover:text-[var(--text-main)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'insights' && <SessionInsights />}
        {activeTab === 'graph'  && <GraphView />}
        {activeTab === 'memory' && <MemoryHits />}
        {activeTab === 'tokens' && <TokenTracker />}
        {activeTab === 'events' && <EventLog events={eventLog} />}
      </div>
    </div>
  );
}

function EventLog({ events }: { events: object[] }) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-faint)] text-sm">
        Raw WebSocket events appear here during execution
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-1 font-mono text-[11px]">
      {[...events].reverse().map((e: any, i) => (
        <div
          key={i}
          className={clsx(
            'px-2 py-1.5 rounded-lg border',
            e.type === 'node_started'   ? 'border-violet-800 bg-violet-900/20 text-violet-300' :
            e.type === 'node_completed' ? 'border-emerald-800 bg-emerald-900/20 text-emerald-300' :
            e.type === 'node_created'   ? 'border-blue-800 bg-blue-900/20 text-blue-300' :
            e.type === 'memory_hit'     ? 'border-amber-800 bg-amber-900/20 text-amber-300' :
            e.type === 'executor_end'   ? 'border-green-600 bg-green-900/30 text-green-300' :
            e.type === 'error'          ? 'border-red-800 bg-red-900/20 text-red-300' :
            'border-[var(--border)] bg-[var(--bg-soft)] text-[var(--text-dim)]',
          )}
        >
          <span className="opacity-60 mr-2">{e.type}</span>
          {e.node_id && <span className="opacity-60 mr-2">{e.node_id}</span>}
          {e.skill_name && <span className="text-[var(--text-main)]">{e.skill_name}</span>}
          {e.duration_s !== undefined && <span className="opacity-60 ml-2">{e.duration_s.toFixed(2)}s</span>}
          {e.final_answer && <span className="opacity-80 ml-2 truncate block">{e.final_answer.slice(0, 80)}</span>}
          {e.chunk_preview && <span className="opacity-70 ml-2 truncate block">{e.chunk_preview.slice(0, 60)}</span>}
          {e.message && <span className="ml-2">{e.message}</span>}
        </div>
      ))}
    </div>
  );
}

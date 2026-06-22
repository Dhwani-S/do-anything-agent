import { useRef, useState, useEffect, type KeyboardEvent } from 'react';
import { GitBranch, HelpCircle, Send, Sparkles, Square, Brain, Play, CheckCircle2, AlertTriangle, Cpu, Database, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useExecutorStore } from '../store/executorStore';
import { useExecutor } from '../hooks/useExecutor';
import type { ChatMessage, ExecutorEvent } from '../types/executor';
import clsx from 'clsx';

// ── Execution Trace ─────────────────────────────────────────────────────────

type TraceLine = {
  icon: 'plan' | 'run' | 'done' | 'fail' | 'memory' | 'tool' | 'end';
  label: string;
  detail?: string;
  timestamp?: number;
};

/** Collapse raw events into a compact timeline (merges consecutive memory hits). */
function buildTimeline(events: ExecutorEvent[]): TraceLine[] {
  const lines: TraceLine[] = [];
  let memoryBatch: ExecutorEvent[] = [];

  const flushMemory = () => {
    if (memoryBatch.length === 0) return;
    const sources = memoryBatch
      .map((e) => {
        const preview = (e as any).chunk_preview ?? '';
        // Extract readable source name from "[sandbox:papers/foo.md chunk 1/3]"
        const match = preview.match(/\[sandbox:papers\/([^\]]+?)(?:\s+chunk\s+\d+\/\d+)?\]/);
        if (match) return match[1];
        // Extract first meaningful sentence
        const clean = preview.replace(/\[.*?\]\(.*?\)/g, '').replace(/_/g, '').trim();
        return clean.length > 60 ? clean.slice(0, 57) + '…' : clean;
      })
      .filter(Boolean);
    const unique = [...new Set(sources)];
    const detail = unique.length <= 3
      ? unique.join(', ')
      : `${unique.slice(0, 2).join(', ')} +${unique.length - 2} more`;
    lines.push({
      icon: 'memory',
      label: `${memoryBatch.length} memory chunk${memoryBatch.length > 1 ? 's' : ''} surfaced`,
      detail: detail || undefined,
      timestamp: memoryBatch[0].timestamp,
    });
    memoryBatch = [];
  };

  for (const event of events) {
    if (event.type === 'memory_hit') {
      memoryBatch.push(event);
      continue;
    }
    flushMemory();

    switch (event.type) {
      case 'node_created': {
        const meta = (event as any).metadata;
        const label = meta?.label ? ` "${meta.label}"` : '';
        const question = meta?.question;
        lines.push({
          icon: 'plan',
          label: `Plan → ${(event as any).skill_name}${label}`,
          detail: question || undefined,
          timestamp: event.timestamp,
        });
        break;
      }
      case 'node_updated':
        lines.push({
          icon: 'plan',
          label: `Rewire ${(event as any).skill_name}`,
          detail: `Now depends on ${((event as any).inputs ?? []).join(', ')}`,
          timestamp: event.timestamp,
        });
        break;
      case 'node_started':
        lines.push({
          icon: 'run',
          label: `Running ${(event as any).skill_name}`,
          detail: (event as any).node_id,
          timestamp: event.timestamp,
        });
        break;
      case 'node_completed': {
        const nc = event as any;
        if (nc.status === 'failed') {
          lines.push({ icon: 'fail', label: `Failed ${nc.skill_name}`, detail: nc.error, timestamp: event.timestamp });
        } else {
          const dur = nc.duration_s != null ? `${nc.duration_s.toFixed(1)}s` : '';
          const tok = (nc.tokens_in || nc.tokens_out) ? ` · ${(nc.tokens_in ?? 0) + (nc.tokens_out ?? 0)} tok` : '';
          lines.push({ icon: 'done', label: `Done ${nc.skill_name}`, detail: `${dur}${tok}`, timestamp: event.timestamp });
        }
        break;
      }
      case 'tool_call':
        lines.push({
          icon: 'tool',
          label: `Tool: ${(event as any).tool_name}`,
          detail: undefined,
          timestamp: event.timestamp,
        });
        break;
      case 'cache_hit': {
        const ch = event as any;
        lines.push({ icon: 'memory', label: 'Cache reused', detail: `${ch.tokens_reused?.toLocaleString()} tokens`, timestamp: event.timestamp });
        break;
      }
      case 'executor_end':
        lines.push({ icon: 'end', label: 'Answer ready', timestamp: event.timestamp });
        break;
      case 'error':
        lines.push({ icon: 'fail', label: 'Error', detail: (event as any).message, timestamp: event.timestamp });
        break;
      default:
        break;
    }
  }
  flushMemory();
  return lines;
}

const traceIcons: Record<TraceLine['icon'], typeof Brain> = {
  plan: Brain,
  run: Play,
  done: CheckCircle2,
  fail: AlertTriangle,
  memory: Database,
  tool: Cpu,
  end: Zap,
};

const traceColors: Record<TraceLine['icon'], string> = {
  plan: 'text-blue-400',
  run: 'text-violet-400',
  done: 'text-emerald-400',
  fail: 'text-red-400',
  memory: 'text-amber-400',
  tool: 'text-cyan-400',
  end: 'text-emerald-300',
};

function ExecutionTrace({ events }: { events: ExecutorEvent[] }) {
  const timeline = buildTimeline(events).slice(-10);

  if (timeline.length === 0) {
    return (
      <span className="flex items-center gap-2 text-[var(--text-dim)] italic text-xs">
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-bounce [animation-delay:300ms]" />
        </span>
        Opening execution stream…
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)]/60 p-3 text-xs backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        <span className="flex items-center gap-1.5"><Sparkles size={10} /> Live Trace</span>
        <span>{events.length} events</span>
      </div>
      <div className="space-y-0.5">
        {timeline.map((line, i) => {
          const Icon = traceIcons[line.icon];
          return (
            <div key={i} className="flex items-start gap-2 py-1 group">
              <Icon size={13} className={clsx('mt-0.5 shrink-0', traceColors[line.icon])} />
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[var(--text-main)]">{line.label}</span>
                {line.detail && (
                  <span className="ml-1.5 text-[var(--text-dim)] truncate">{line.detail}</span>
                )}
              </div>
              {line.timestamp && (
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-faint)] opacity-0 group-hover:opacity-100 transition-opacity">
                  {new Date(line.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  selected,
  onSelectRun,
  onElicit,
}: {
  msg: ChatMessage;
  selected: boolean;
  onSelectRun: (runId: string) => void;
  onElicit: (prompt: string) => void;
}) {
  const isUser = msg.role === 'user';

  // Render minimal markdown: **bold**, `code`, _italic_
  const renderContent = (text: string) => {
    const parts = text
      .split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g)
      .map((chunk, i) => {
        if (chunk.startsWith('**') && chunk.endsWith('**'))
          return <strong key={i}>{chunk.slice(2, -2)}</strong>;
        if (chunk.startsWith('`') && chunk.endsWith('`'))
          return <code key={i} className="bg-slate-700 px-1 py-0.5 rounded text-xs font-mono">{chunk.slice(1, -1)}</code>;
        if (chunk.startsWith('_') && chunk.endsWith('_'))
          return <em key={i}>{chunk.slice(1, -1)}</em>;
        return <span key={i}>{chunk}</span>;
      });
    return <>{parts}</>;
  };

  return (
    <div
      role={isUser && msg.run_id ? 'button' : undefined}
      tabIndex={isUser && msg.run_id ? 0 : undefined}
      onClick={() => isUser && msg.run_id && onSelectRun(msg.run_id)}
      onKeyDown={(event) => {
        if (isUser && msg.run_id && (event.key === 'Enter' || event.key === ' ')) onSelectRun(msg.run_id);
      }}
      className={clsx(
        'mb-4 pl-3 border-l-2 transition-colors float-in',
        isUser && msg.run_id && 'cursor-pointer',
        selected ? 'border-[var(--brand)]' : 'border-[var(--border)] hover:border-[var(--brand)]',
      )}
    >
      <div className="flex items-center justify-between py-1 text-[11px]">
        <span className={clsx('uppercase tracking-wider font-semibold inline-flex items-center gap-1.5', isUser ? 'text-[var(--brand)]' : 'text-emerald-500')}>
          {isUser && <GitBranch size={11} />}
          {isUser ? 'User Prompt' : 'Agent Output'}
        </span>
        <span className="text-[var(--text-faint)]">{new Date(msg.timestamp).toLocaleTimeString()}</span>
      </div>
      <div className={clsx('py-2.5 pr-3 text-sm leading-relaxed text-[var(--text-main)]', msg.streaming && 'flow-scan')}>
        {msg.streaming ? (
          <ExecutionTrace events={msg.node_events ?? []} />
        ) : !isUser ? (
          <AnswerView content={msg.content} onElicit={onElicit} />
        ) : (
          <span>{renderContent(msg.content)}</span>
        )}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const messages = useExecutorStore((s) => s.messages);
  const isRunning = useExecutorStore((s) => s.isRunning);
  const selectedRunId = useExecutorStore((s) => s.selectedRunId);
  const selectRun = useExecutorStore((s) => s.selectRun);
  const devMode = useExecutorStore((s) => s.devMode);
  const toggleDevMode = useExecutorStore((s) => s.toggleDevMode);
  const { send, cancel } = useExecutor();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = () => {
    const q = input.trim();
    if (!q || isRunning) return;
    setInput('');
    send(q);
  };

  const handleSelectRun = (runId: string) => {
    selectRun(runId);
    if (!devMode) toggleDevMode();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]/30">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="relative w-48 h-28 mb-5">
              <div className="absolute inset-x-4 top-3 h-px bg-[var(--brand)]/50 signal-line" />
              <div className="absolute left-2 top-8 w-16 h-px bg-[var(--teal)]/70 signal-line" />
              <div className="absolute right-3 top-16 w-20 h-px bg-[var(--amber)]/70 signal-line" />
              <div className="absolute left-1/2 top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand)] activity-dot" />
              <div className="absolute left-8 bottom-5 w-2 h-2 rounded-full bg-[var(--teal)] activity-dot" />
              <div className="absolute right-10 bottom-7 w-2 h-2 rounded-full bg-[var(--amber)] activity-dot" />
            </div>
            <p className="text-lg font-semibold mb-2">Execution Workspace</p>
            <p className="text-sm text-[var(--text-dim)] max-w-md">
              Ask, inspect, and iterate. The agent plans DAG nodes, retrieves memory,
              runs tools, and streams telemetry into the insights pane.
            </p>
            <div className="mt-5 text-xs text-[var(--text-faint)] border-l-2 border-[var(--brand)] pl-3 py-1 text-left max-w-lg">
              Try the parallel population query to watch concurrent nodes move through the graph.
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            selected={Boolean(msg.run_id && msg.run_id === selectedRunId)}
            onSelectRun={handleSelectRun}
            onElicit={setInput}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border)] p-4 bg-[var(--bg-elev)]/65">
        <div className="flex gap-3 items-end rounded-xl px-4 py-2 border border-[var(--border)] bg-[var(--bg-app)]/55 focus-within:border-[var(--brand)]/50 transition-colors flow-scan">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder={isRunning ? 'Agent is running…' : 'Ask anything… (Enter to send, Shift+Enter for newline)'}
            rows={1}
            className="flex-1 bg-transparent text-sm text-[var(--text-main)] placeholder-[var(--text-faint)] resize-none outline-none max-h-32 py-1"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          {isRunning && (
            <button
              onClick={cancel}
              className="flex-shrink-0 inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
              title="Stop the running query"
            >
              <Square size={13} />
              Stop
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={isRunning || !input.trim()}
            className={clsx(
              'flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors',
              isRunning
                ? 'bg-[var(--bg-soft)] text-[var(--text-faint)] cursor-not-allowed'
                : input.trim()
                ? 'bg-[var(--brand-strong)] text-white hover:brightness-110'
                : 'bg-[var(--bg-soft)] text-[var(--text-faint)] cursor-not-allowed',
            )}
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-xs text-[var(--text-faint)] mt-2 text-center">
          WebSocket streaming enabled. Enter sends. Shift+Enter inserts newline.
        </p>
      </div>
    </div>
  );
}

function MarkdownAnswer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mt-4 first:mt-0 text-xl font-semibold text-[var(--text-main)]">{children}</h1>,
        h2: ({ children }) => <h2 className="mt-4 first:mt-0 text-lg font-semibold text-[var(--text-main)]">{children}</h2>,
        h3: ({ children }) => <h3 className="mt-4 first:mt-0 text-base font-semibold text-[var(--text-main)]">{children}</h3>,
        p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
        li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-[var(--text-main)]">{children}</strong>,
        em: ({ children }) => <em className="text-[var(--text-dim)]">{children}</em>,
        code: ({ children }) => <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-xs text-emerald-300">{children}</code>,
        pre: ({ children }) => <pre className="my-3 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-app)]/70 p-3 text-xs">{children}</pre>,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full border-collapse text-left text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-[var(--bg-soft)] text-[var(--text-main)]">{children}</thead>,
        th: ({ children }) => <th className="border-b border-[var(--border)] px-3 py-2 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-b border-[var(--border)] px-3 py-2 align-top text-[var(--text-dim)] last:border-b-0">{children}</td>,
        blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-[var(--brand)] pl-3 text-[var(--text-dim)]">{children}</blockquote>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-[var(--brand)] underline underline-offset-2">{children}</a>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function AnswerView({
  content,
  onElicit,
}: {
  content: string;
  onElicit: (prompt: string) => void;
}) {
  const sourceMatch = content.match(/Source:\s*(.+)$/i);
  const answerText = sourceMatch ? content.slice(0, sourceMatch.index).trim() : content.trim();
  const needsElicitation = /could not|unable|unavailable|not successfully|please check|missing/i.test(content);
  const elicitationPrompt = 'Please use an alternate reliable source for the missing detail and update the recommendation with evidence.';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
        <Sparkles size={12} className="text-[var(--teal)]" />
        Structured Answer
      </div>

      <div className="text-sm leading-relaxed text-[var(--text-main)]">
        <MarkdownAnswer content={answerText} />
      </div>

      {sourceMatch && (
        <div className="border-l border-[var(--teal)] pl-3 text-xs text-[var(--text-dim)]">
          <span className="uppercase tracking-wider text-[var(--text-faint)]">Evidence</span>
          <p className="mt-1 break-words">{sourceMatch[1]}</p>
        </div>
      )}

      {needsElicitation && (
        <div className="border-l-2 border-[var(--amber)] pl-3 py-1 text-xs bg-[var(--amber)]/5">
          <p className="font-semibold text-[var(--amber)] inline-flex items-center gap-1.5">
            <HelpCircle size={12} />
            Elicitation needed
          </p>
          <p className="mt-1 text-[var(--text-dim)]">
            The agent reported missing or unreliable data. Ask it to fetch an alternate source or provide a preferred source.
          </p>
          <button
            onClick={() => onElicit(elicitationPrompt)}
            className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1 text-[11px] text-[var(--text-main)] hover:border-[var(--amber)] transition-colors"
          >
            Draft follow-up prompt
          </button>
        </div>
      )}
    </div>
  );
}

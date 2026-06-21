import { useRef, useState, useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { GitBranch, HelpCircle, Send, Sparkles, Square } from 'lucide-react';
import { useExecutorStore } from '../store/executorStore';
import { useExecutor } from '../hooks/useExecutor';
import type { ChatMessage } from '../types/executor';
import clsx from 'clsx';

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
        {msg.streaming && msg.content === '_Thinking…_' ? (
          <span className="flex items-center gap-2 text-[var(--text-dim)] italic text-xs">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-bounce [animation-delay:300ms]" />
            </span>
            Planning and running nodes
          </span>
        ) : msg.streaming ? (
          <span className="text-[var(--text-dim)] text-xs italic">{renderContent(msg.content)}</span>
        ) : !isUser ? (
          <AnswerView content={msg.content} renderInline={renderContent} onElicit={onElicit} />
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

function AnswerView({
  content,
  renderInline,
  onElicit,
}: {
  content: string;
  renderInline: (text: string) => ReactNode;
  onElicit: (prompt: string) => void;
}) {
  const sourceMatch = content.match(/Source:\s*(.+)$/i);
  const answerText = sourceMatch ? content.slice(0, sourceMatch.index).trim() : content.trim();
  const numberedParts = answerText.split(/\s(?=\d+[.)]\s)/g).filter(Boolean);
  const needsElicitation = /could not|unable|unavailable|not successfully|please check|missing/i.test(content);
  const elicitationPrompt = 'Please use an alternate reliable source for the missing detail and update the recommendation with evidence.';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
        <Sparkles size={12} className="text-[var(--teal)]" />
        Structured Answer
      </div>

      {numberedParts.length > 1 ? (
        <div className="space-y-2">
          {numberedParts.map((part, index) => (
            <div key={index} className="grid grid-cols-[22px_1fr] gap-2">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)]/15 text-[10px] text-[var(--brand)]">{index + 1}</span>
              <p>{renderInline(part.replace(/^\d+[.)]\s*/, ''))}</p>
            </div>
          ))}
        </div>
      ) : (
        <p>{renderInline(answerText)}</p>
      )}

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

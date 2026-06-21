import { useRef, useState, useEffect, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { useExecutorStore } from '../store/executorStore';
import { useExecutor } from '../hooks/useExecutor';
import type { ChatMessage } from '../types/executor';
import clsx from 'clsx';

function MessageBubble({ msg }: { msg: ChatMessage }) {
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
    <div className={clsx('flex gap-3 mb-4', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1">
          A
        </div>
      )}
      <div
        className={clsx(
          'max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
          isUser
            ? 'bg-violet-600 text-white rounded-tr-sm'
            : 'bg-slate-800 text-slate-200 rounded-tl-sm',
        )}
      >
        {msg.streaming && msg.content === '_Thinking…_' ? (
          <span className="flex items-center gap-2 text-slate-400 italic text-xs">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
            </span>
            Thinking
          </span>
        ) : msg.streaming ? (
          <span className="text-slate-400 text-xs italic">{renderContent(msg.content)}</span>
        ) : (
          <span>{renderContent(msg.content)}</span>
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1">
          U
        </div>
      )}
    </div>
  );
}

export function ChatPanel() {
  const messages = useExecutorStore((s) => s.messages);
  const isRunning = useExecutorStore((s) => s.isRunning);
  const { send, cancel } = useExecutor();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message history */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center px-8">
            <div className="text-4xl mb-4">🤖</div>
            <p className="text-lg font-medium text-slate-400 mb-2">Do-Anything Agent</p>
            <p className="text-sm">EAGV3 Session 8 — DAG Orchestrator with real-time streaming</p>
            <p className="text-xs mt-4 text-slate-600">Try: <span className="text-violet-400">"What is 2 + 2?"</span> or <span className="text-violet-400">"Summarise quantum computing"</span></p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-700/50 p-4">
        <div className="flex gap-3 items-end bg-slate-800 rounded-2xl px-4 py-2 border border-slate-700 focus-within:border-violet-500/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder={isRunning ? 'Agent is running…' : 'Ask anything… (Enter to send, Shift+Enter for newline)'}
            rows={1}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none outline-none max-h-32 py-1"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            onClick={isRunning ? cancel : handleSubmit}
            disabled={!isRunning && !input.trim()}
            className={clsx(
              'flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors',
              isRunning
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : input.trim()
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed',
            )}
          >
            {isRunning ? <Square size={14} /> : <Send size={14} />}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2 text-center">
          Streaming via WebSocket · Session 8 DAG Orchestrator
        </p>
      </div>
    </div>
  );
}

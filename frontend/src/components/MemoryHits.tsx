import { useExecutorStore } from '../store/executorStore';
import { Brain } from 'lucide-react';

export function MemoryHits() {
  const hits = useExecutorStore((s) => s.memoryHits);

  if (hits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-2">
        <Brain size={24} />
        <span>Memory hits appear after each query</span>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto h-full">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">
        {hits.length} memory hit{hits.length !== 1 ? 's' : ''} — FAISS vector retrieval
      </p>
      {hits.map((hit, i) => (
        <div
          key={`${hit.hit_id}-${i}`}
          className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-xs"
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="font-mono text-violet-400 truncate">{hit.hit_id}</span>
            <span className="text-slate-500 flex-shrink-0">
              {hit.similarity > 0 ? `${(hit.similarity * 100).toFixed(1)}%` : '—'}
            </span>
          </div>
          <p className="text-slate-300 leading-relaxed">{hit.chunk_preview}</p>
          <p className="text-slate-600 mt-1 text-[10px]">source: {hit.source}</p>
        </div>
      ))}
    </div>
  );
}

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ExecutorEvent, DAGNode, ChatMessage, MemoryHitEvent,
  NodeCreatedEvent, NodeCompletedEvent,
} from '../types/executor';

interface TokenTotals {
  in: number;
  out: number;
}

interface ExecutorState {
  // Chat
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  updateLastAssistantMessage: (content: string, streaming?: boolean) => void;
  finishLastAssistantMessage: (content: string) => void;

  // DAG
  nodes: Record<string, DAGNode>;
  nodeOrder: string[];           // insertion-order for display
  setNodeStatus: (id: string, status: DAGNode['status']) => void;
  upsertNode: (event: NodeCreatedEvent) => void;
  completeNode: (event: NodeCompletedEvent) => void;
  resetDAG: () => void;

  // Memory hits (current session)
  memoryHits: MemoryHitEvent[];
  addMemoryHit: (hit: MemoryHitEvent) => void;
  clearMemoryHits: () => void;

  // Token totals (current session)
  tokenTotals: TokenTotals;
  addTokens: (in_: number, out: number) => void;
  resetTokens: () => void;

  // Raw event log (for dev mode)
  eventLog: ExecutorEvent[];
  pushEvent: (e: ExecutorEvent) => void;
  clearEventLog: () => void;

  // Session
  sessionId: string | null;
  setSessionId: (id: string | null) => void;

  // Developer mode toggle
  devMode: boolean;
  toggleDevMode: () => void;

  // Connection state
  isRunning: boolean;
  setRunning: (v: boolean) => void;
}

export const useExecutorStore = create<ExecutorState>()(
  persist((set) => ({
  // ── Chat ────────────────────────────────────────────────────────────────
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastAssistantMessage: (content, streaming = true) =>
    set((s) => {
      const msgs = [...s.messages];
      const idx = msgs.findLastIndex((m) => m.role === 'assistant');
      if (idx >= 0) msgs[idx] = { ...msgs[idx], content, streaming };
      return { messages: msgs };
    }),
  finishLastAssistantMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      const idx = msgs.findLastIndex((m) => m.role === 'assistant');
      if (idx >= 0) msgs[idx] = { ...msgs[idx], content, streaming: false };
      return { messages: msgs };
    }),

  // ── DAG ─────────────────────────────────────────────────────────────────
  nodes: {},
  nodeOrder: [],
  setNodeStatus: (id, status) =>
    set((s) => ({ nodes: { ...s.nodes, [id]: { ...s.nodes[id], status } } })),
  upsertNode: (event) =>
    set((s) => ({
      nodes: {
        ...s.nodes,
        [event.node_id]: {
          id: event.node_id,
          skill_name: event.skill_name,
          status: 'pending',
          inputs: event.inputs,
          started_at: event.timestamp,
        },
      },
      nodeOrder: s.nodeOrder.includes(event.node_id)
        ? s.nodeOrder
        : [...s.nodeOrder, event.node_id],
    })),
  completeNode: (event) =>
    set((s) => ({
      nodes: {
        ...s.nodes,
        [event.node_id]: {
          ...s.nodes[event.node_id],
          status: event.status,
          duration_s: event.duration_s,
          tokens_in: event.tokens_in,
          tokens_out: event.tokens_out,
          error: event.error ?? undefined,
          completed_at: event.timestamp,
        },
      },
    })),
  resetDAG: () => set({ nodes: {}, nodeOrder: [] }),

  // ── Memory ───────────────────────────────────────────────────────────────
  memoryHits: [],
  addMemoryHit: (hit) => set((s) => ({ memoryHits: [...s.memoryHits, hit] })),
  clearMemoryHits: () => set({ memoryHits: [] }),

  // ── Tokens ──────────────────────────────────────────────────────────────
  tokenTotals: { in: 0, out: 0 },
  addTokens: (in_, out) =>
    set((s) => ({ tokenTotals: { in: s.tokenTotals.in + in_, out: s.tokenTotals.out + out } })),
  resetTokens: () => set({ tokenTotals: { in: 0, out: 0 } }),

  // ── Event log ───────────────────────────────────────────────────────────
  eventLog: [],
  pushEvent: (e) => set((s) => ({ eventLog: [...s.eventLog.slice(-200), e] })),
  clearEventLog: () => set({ eventLog: [] }),

  // ── Session ──────────────────────────────────────────────────────────────
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),

  // ── Dev mode ─────────────────────────────────────────────────────────────
  devMode: false,
  toggleDevMode: () => set((s) => ({ devMode: !s.devMode })),

  // ── Running state ────────────────────────────────────────────────────────
  isRunning: false,
  setRunning: (v) => set({ isRunning: v }),
}),
  {
    name: 'eagv3-executor-ui',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      messages: state.messages,
      nodes: state.nodes,
      nodeOrder: state.nodeOrder,
      memoryHits: state.memoryHits,
      tokenTotals: state.tokenTotals,
      eventLog: state.eventLog,
      sessionId: state.sessionId,
      devMode: state.devMode,
    }),
  },
));

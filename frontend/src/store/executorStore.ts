import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ExecutorEvent, DAGNode, ChatMessage, MemoryHitEvent,
  NodeCreatedEvent, NodeCompletedEvent,
} from '../types/executor';

const STORE_KEY = 'eagv3-executor-ui';
const hadStoredSnapshot =
  typeof window !== 'undefined' && window.localStorage.getItem(STORE_KEY) !== null;

interface TokenTotals {
  in: number;
  out: number;
}

type ThemeMode = 'dark' | 'light';
type RunStatus = 'running' | 'complete' | 'failed' | 'cancelled';

interface RunStepMetric {
  nodeId: string;
  skillName: string;
  status: DAGNode['status'];
  startedAt?: number;
  completedAt?: number;
  durationS?: number;
  tokensIn: number;
  tokensOut: number;
  memoryHits: number;
  error?: string;
}

interface QueryRun {
  id: string;
  query: string;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  responseTimeMs?: number;
  totalTimeS?: number;
  sessionId?: string | null;
  tokensIn: number;
  tokensOut: number;
  memoryHits: number;
  nodeCreated: number;
  nodeCompleted: number;
  nodeFailed: number;
  steps: Record<string, RunStepMetric>;
  graphNodes: Record<string, DAGNode>;
  graphNodeOrder: string[];
  events: ExecutorEvent[];
  memoryHitsSnapshot: MemoryHitEvent[];
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

  // Query analytics
  currentRun: QueryRun | null;
  runHistory: QueryRun[];
  selectedRunId: string | null;
  selectRun: (runId: string | null) => void;
  startRun: (query: string, runId: string) => void;
  trackEvent: (e: ExecutorEvent) => void;
  endRun: (status: RunStatus, details?: {
    sessionId?: string | null;
    totalTimeS?: number;
    responseTimeMs?: number;
  }) => void;

  // Developer mode toggle
  devMode: boolean;
  toggleDevMode: () => void;

  // Theme
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;

  // Connection state
  isRunning: boolean;
  setRunning: (v: boolean) => void;

  // Hydration state
  hasHydrated: boolean;
  restoredFromStorage: boolean;
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

  // ── Query analytics ──────────────────────────────────────────────────────
  currentRun: null,
  runHistory: [],
  selectedRunId: null,
  selectRun: (runId) => set({ selectedRunId: runId }),
  startRun: (query, runId) =>
    set({
      currentRun: {
        id: runId,
        query,
        status: 'running',
        startedAt: Date.now(),
        tokensIn: 0,
        tokensOut: 0,
        memoryHits: 0,
        nodeCreated: 0,
        nodeCompleted: 0,
        nodeFailed: 0,
        steps: {},
        graphNodes: {},
        graphNodeOrder: [],
        events: [],
        memoryHitsSnapshot: [],
      },
      selectedRunId: runId,
    }),
  trackEvent: (event) =>
    set((s) => {
      if (!s.currentRun) return {};

      const run = {
        ...s.currentRun,
        steps: { ...s.currentRun.steps },
        graphNodes: s.nodes,
        graphNodeOrder: s.nodeOrder,
        events: s.eventLog,
        memoryHitsSnapshot: s.memoryHits,
      };

      const ensureStep = (nodeId: string, skillName = 'unknown'): RunStepMetric => {
        if (!run.steps[nodeId]) {
          run.steps[nodeId] = {
            nodeId,
            skillName,
            status: 'pending',
            tokensIn: 0,
            tokensOut: 0,
            memoryHits: 0,
          };
        }
        return run.steps[nodeId];
      };

      switch (event.type) {
        case 'node_created': {
          run.nodeCreated += 1;
          const step = ensureStep(event.node_id, event.skill_name);
          step.skillName = event.skill_name;
          break;
        }
        case 'node_started': {
          const step = ensureStep(event.node_id, event.skill_name);
          step.skillName = event.skill_name;
          step.status = 'running';
          step.startedAt = event.timestamp * 1000;
          break;
        }
        case 'node_completed': {
          run.nodeCompleted += 1;
          if (event.status === 'failed') run.nodeFailed += 1;
          run.tokensIn += event.tokens_in;
          run.tokensOut += event.tokens_out;

          const step = ensureStep(event.node_id, event.skill_name);
          step.skillName = event.skill_name;
          step.status = event.status;
          step.durationS = event.duration_s;
          step.tokensIn += event.tokens_in;
          step.tokensOut += event.tokens_out;
          step.completedAt = event.timestamp * 1000;
          step.error = event.error ?? undefined;
          break;
        }
        case 'memory_hit': {
          run.memoryHits += 1;
          const step = ensureStep(event.node_id);
          step.memoryHits += 1;
          break;
        }
        default:
          break;
      }

      return { currentRun: run };
    }),
  endRun: (status, details) =>
    set((s) => {
      if (!s.currentRun) return {};

      const endedAt = Date.now();
      const completedRun: QueryRun = {
        ...s.currentRun,
        status,
        endedAt,
        sessionId: details?.sessionId ?? s.currentRun.sessionId ?? s.sessionId,
        totalTimeS: details?.totalTimeS,
        graphNodes: s.nodes,
        graphNodeOrder: s.nodeOrder,
        events: s.eventLog,
        memoryHitsSnapshot: s.memoryHits,
        responseTimeMs:
          details?.responseTimeMs
          ?? (details?.totalTimeS !== undefined ? Math.round(details.totalTimeS * 1000) : endedAt - s.currentRun.startedAt),
      };

      const withoutCurrent = s.runHistory.filter((r) => r.id !== completedRun.id);

      return {
        currentRun: completedRun,
        runHistory: [...withoutCurrent, completedRun].slice(-40),
      };
    }),

  // ── Dev mode ─────────────────────────────────────────────────────────────
  devMode: false,
  toggleDevMode: () => set((s) => ({ devMode: !s.devMode })),

  // ── Theme ────────────────────────────────────────────────────────────────
  theme: 'dark',
  setTheme: (mode) => set({ theme: mode }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  // ── Running state ────────────────────────────────────────────────────────
  isRunning: false,
  setRunning: (v) => set({ isRunning: v }),

  // ── Hydration state ──────────────────────────────────────────────────────
  hasHydrated: false,
  restoredFromStorage: false,
}),
  {
    name: STORE_KEY,
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
      currentRun: state.currentRun,
      runHistory: state.runHistory,
      selectedRunId: state.selectedRunId,
      theme: state.theme,
    }),
    onRehydrateStorage: () => (state, error) => {
      if (state) {
        state.hasHydrated = true;
        state.restoredFromStorage = !error && hadStoredSnapshot;
      }
    },
  },
));

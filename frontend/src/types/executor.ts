// ── Executor Event Types ─────────────────────────────────────────────────────
// Mirror of src/schemas.py ExecutorEvent* models

export interface NodeCreatedEvent {
  type: 'node_created';
  session_id: string;
  node_id: string;
  skill_name: string;
  inputs: string[];
  timestamp: number;
}

export interface NodeStartedEvent {
  type: 'node_started';
  node_id: string;
  skill_name: string;
  timestamp: number;
}

export interface NodeCompletedEvent {
  type: 'node_completed';
  node_id: string;
  skill_name: string;
  status: 'complete' | 'failed';
  duration_s: number;
  tokens_in: number;
  tokens_out: number;
  error: string | null;
  timestamp: number;
}

export interface MemoryHitEvent {
  type: 'memory_hit';
  node_id: string;
  hit_id: string;
  similarity: number;
  chunk_preview: string;
  source: string;
  timestamp: number;
}

export interface ToolCallEvent {
  type: 'tool_call';
  node_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  timestamp: number;
}

export interface CacheHitEvent {
  type: 'cache_hit';
  node_id: string;
  model: string;
  tokens_reused: number;
  timestamp: number;
}

export interface ExecutorEndEvent {
  type: 'executor_end';
  session_id: string;
  final_answer: string;
  total_tokens: number;
  total_time_s: number;
  timestamp: number;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  timestamp: number;
}

export type ExecutorEvent =
  | NodeCreatedEvent
  | NodeStartedEvent
  | NodeCompletedEvent
  | MemoryHitEvent
  | ToolCallEvent
  | CacheHitEvent
  | ExecutorEndEvent
  | ErrorEvent;

// ── Application State Types ───────────────────────────────────────────────────

export type NodeStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface DAGNode {
  id: string;
  skill_name: string;
  status: NodeStatus;
  inputs: string[];
  duration_s?: number;
  tokens_in?: number;
  tokens_out?: number;
  error?: string;
  started_at?: number;
  completed_at?: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  run_id?: string;
  session_id?: string;
  timestamp: number;
  // Live status for in-progress messages
  streaming?: boolean;
  node_events?: ExecutorEvent[];
}

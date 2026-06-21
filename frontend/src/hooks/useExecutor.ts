import { useCallback, useRef } from 'react';
import type { ExecutorEvent } from '../types/executor';
import { useExecutorStore } from '../store/executorStore';

const WS_URL = '/ws/execute';

export function useExecutor() {
  const wsRef = useRef<WebSocket | null>(null);
  const store = useExecutorStore();

  const send = useCallback(
    (query: string) => {
      if (store.isRunning) return;

      // Reset state for new run
      store.resetDAG();
      store.clearMemoryHits();
      store.clearEventLog();
      store.resetTokens();
      store.setRunning(true);

      // Add user message to chat
      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: query,
        timestamp: Date.now(),
      };
      store.addMessage(userMsg);

      // Add placeholder assistant message
      const assistantMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: '',
        streaming: true,
        timestamp: Date.now(),
      };
      store.addMessage(assistantMsg);

      const encoded = encodeURIComponent(query);
      const ws = new WebSocket(`${WS_URL}?query=${encoded}`);
      wsRef.current = ws;

      ws.onopen = () => {
        store.updateLastAssistantMessage('_Thinking…_');
      };

      ws.onmessage = (evt) => {
        const event: ExecutorEvent = JSON.parse(evt.data);
        store.pushEvent(event);

        switch (event.type) {
          case 'node_created':
            store.upsertNode(event);
            store.updateLastAssistantMessage(
              `**Planner** created node \`${event.node_id}\` → \`${event.skill_name}\``,
            );
            break;

          case 'node_started':
            store.setNodeStatus(event.node_id, 'running');
            store.updateLastAssistantMessage(
              `**Running** \`${event.skill_name}\` (${event.node_id})…`,
            );
            break;

          case 'node_completed':
            store.completeNode(event);
            store.addTokens(event.tokens_in, event.tokens_out);
            if (event.status === 'failed') {
              store.updateLastAssistantMessage(
                `**Failed** \`${event.skill_name}\`: ${event.error ?? 'unknown error'}`,
              );
            }
            break;

          case 'memory_hit':
            store.addMemoryHit(event);
            break;

          case 'executor_end': {
            store.setSessionId(event.session_id);
            store.finishLastAssistantMessage(event.final_answer);
            store.setRunning(false);
            ws.close();
            break;
          }

          case 'error':
            store.finishLastAssistantMessage(`⚠️ Error: ${event.message}`);
            store.setRunning(false);
            break;
        }
      };

      ws.onerror = () => {
        store.finishLastAssistantMessage(
          '⚠️ Connection error — is the backend running on port 8000?',
        );
        store.setRunning(false);
      };

      ws.onclose = () => {
        store.setRunning(false);
      };
    },
    [store],
  );

  const cancel = useCallback(() => {
    wsRef.current?.close();
    store.setRunning(false);
  }, [store]);

  return { send, cancel };
}

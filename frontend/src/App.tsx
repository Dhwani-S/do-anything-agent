import { useExecutorStore } from "./store/executorStore";
import { ChatPanel } from "./components/ChatPanel";
import { DeveloperPanel } from "./components/DeveloperPanel";
import { Code2, MessageSquare } from "lucide-react";
import clsx from "clsx";

export default function App() {
  const devMode = useExecutorStore((s) => s.devMode);
  const toggleDevMode = useExecutorStore((s) => s.toggleDevMode);
  const isRunning = useExecutorStore((s) => s.isRunning);

  return (
    <div className="h-screen flex flex-col bg-[#0f1117] overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-slate-900/70 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <MessageSquare size={14} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-200 leading-none">Do-Anything Agent</h1>
            <p className="text-[10px] text-slate-500 mt-0.5">EAGV3 Session 8 — DAG Orchestrator</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-violet-400">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              Running
            </span>
          )}
          <button
            onClick={toggleDevMode}
            className={clsx(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              devMode
                ? "bg-violet-600/20 border-violet-500/50 text-violet-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-600",
            )}
          >
            <Code2 size={13} />
            Developer Mode
            <span
              className={clsx(
                "w-4 h-2.5 rounded-full transition-colors relative",
                devMode ? "bg-violet-500" : "bg-slate-600",
              )}
            >
              <span
                className={clsx(
                  "absolute top-0.5 w-1.5 h-1.5 rounded-full bg-white transition-all",
                  devMode ? "left-[9px]" : "left-0.5",
                )}
              />
            </span>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat always visible */}
        <div className={clsx("flex flex-col transition-all duration-300", devMode ? "w-[42%]" : "w-full")}>
          <ChatPanel />
        </div>

        {/* Developer panel — slides in on toggle */}
        {devMode && (
          <div className="flex-1 overflow-hidden">
            <DeveloperPanel />
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useExecutorStore } from "./store/executorStore";
import { ChatPanel } from "./components/ChatPanel";
import { DeveloperPanel } from "./components/DeveloperPanel";
import {
  Beaker,
  Bug,
  ChevronDown,
  ChevronRight,
  Code2,
  Files,
  FolderTree,
  GitBranch,
  Layers3,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import clsx from "clsx";

export default function App() {
  const devMode = useExecutorStore((state) => state.devMode);
  const toggleDevMode = useExecutorStore((state) => state.toggleDevMode);
  const isRunning = useExecutorStore((state) => state.isRunning);
  const hasHydrated = useExecutorStore((state) => state.hasHydrated);
  const restoredFromStorage = useExecutorStore((state) => state.restoredFromStorage);
  const theme = useExecutorStore((state) => state.theme);
  const toggleTheme = useExecutorStore((state) => state.toggleTheme);
  const runHistory = useExecutorStore((state) => state.runHistory);
  const currentRun = useExecutorStore((state) => state.currentRun);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const visibleRuns = [...runHistory].reverse().slice(0, 6);

  return (
    <div className="h-screen flex flex-col overflow-hidden text-[var(--text-main)] workbench-grid">
      <header className="h-12 flex items-center justify-between px-3 border-b border-[var(--border)] bg-[var(--bg-elev)]/92 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--brand-strong)] text-white flex items-center justify-center shadow-lg shadow-blue-500/20 activity-dot">
            <MessageSquare size={14} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-none tracking-wide truncate">Do-Anything Agent</h1>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5 truncate">Agentic workbench · EAGV3 Session 8</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasHydrated && restoredFromStorage && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Rehydrated
            </span>
          )}
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-[var(--brand)]">
              <span className="w-2 h-2 rounded-full bg-[var(--brand)] animate-pulse" />
              Running
            </span>
          )}
          <button
            onClick={toggleTheme}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] text-[var(--text-dim)] text-xs hover:text-[var(--text-main)] transition-colors"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            onClick={toggleDevMode}
            className={clsx(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              devMode
                ? "bg-[var(--brand)]/15 border-[var(--brand)]/45 text-[var(--brand)]"
                : "bg-[var(--bg-soft)] border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text-main)]",
            )}
            title="Toggle developer insights"
          >
            <Code2 size={13} />
            Insights
            {devMode ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar
          workspaceOpen={workspaceOpen}
          devMode={devMode}
          isRunning={isRunning}
          onToggleWorkspace={() => setWorkspaceOpen((open) => !open)}
          onToggleDevMode={toggleDevMode}
        />

        <aside
          className={clsx(
            "hidden md:flex panel-motion border-r border-[var(--border)] bg-[var(--bg-elev)]/76 backdrop-blur-sm flex-col overflow-hidden",
            workspaceOpen ? "w-[280px] opacity-100" : "w-0 opacity-0 pointer-events-none",
          )}
        >
          <PanelHeader
            icon={<FolderTree size={13} />}
            title="Explorer"
            actionIcon={workspaceOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            onAction={() => setWorkspaceOpen((open) => !open)}
          />

          <div className="flex-1 overflow-y-auto py-2 text-sm">
            <ExplorerSection title="Files" open={filesOpen} onToggle={() => setFilesOpen((open) => !open)}>
              <FileTree />
            </ExplorerSection>

            <ExecutionSurface isRunning={isRunning} memoryActive={Boolean(currentRun?.memoryHits)} />

            <ExplorerSection title="Query History" open={historyOpen} onToggle={() => setHistoryOpen((open) => !open)}>
              {visibleRuns.length === 0 ? (
                <p className="px-4 py-2 text-xs text-[var(--text-faint)]">No completed queries yet.</p>
              ) : (
                <div className="space-y-2 px-3 py-2">
                  {visibleRuns.map((run) => (
                    <div key={run.id} className="border-l-2 border-[var(--teal)] pl-2 py-0.5 text-xs float-in">
                      <p className="line-clamp-2 text-[var(--text-main)]">{run.query}</p>
                      <p className="text-[10px] text-[var(--text-faint)] mt-1">
                        {run.status} · {((run.responseTimeMs ?? 0) / 1000).toFixed(1)}s · {run.memoryHits} memory hits
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ExplorerSection>
          </div>
        </aside>

        <main className="flex flex-1 min-w-0 overflow-hidden">
          <section className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div className="h-10 border-b border-[var(--border)] bg-[var(--bg-elev)]/72 px-3 flex items-center gap-2 text-xs flow-scan">
              <button
                onClick={() => setWorkspaceOpen((open) => !open)}
                className="md:hidden text-[var(--text-faint)] hover:text-[var(--text-main)]"
                title="Toggle workspace"
              >
                <Files size={14} />
              </button>
              <span className="px-2 py-1 rounded-md bg-[var(--brand)]/12 text-[var(--brand)]">assistant.console</span>
              <span className="text-[var(--text-faint)] truncate">chat + execution stream</span>
            </div>
            <ChatPanel />
          </section>

          <aside
            className={clsx(
              "panel-motion border-l border-[var(--border)] bg-[var(--bg-elev)]/78 backdrop-blur-sm overflow-hidden hidden lg:flex",
              devMode ? "w-[48%] min-w-[460px]" : "w-12 min-w-12",
            )}
          >
            {devMode ? (
              <div className="flex flex-col w-full min-w-0">
                <div className="h-10 border-b border-[var(--border)] px-3 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 uppercase tracking-wider text-[var(--text-faint)]">
                    <Layers3 size={13} />
                    Developer Insights
                  </span>
                  <button
                    onClick={toggleDevMode}
                    className="text-[var(--text-faint)] hover:text-[var(--text-main)] transition-colors"
                    title="Collapse developer panel"
                  >
                    <PanelRightClose size={15} />
                  </button>
                </div>
                <DeveloperPanel />
              </div>
            ) : (
              <CollapsedInsightsRail onOpen={toggleDevMode} isRunning={isRunning} />
            )}
          </aside>
        </main>
      </div>
    </div>
  );
}

function ActivityBar({
  workspaceOpen,
  devMode,
  isRunning,
  onToggleWorkspace,
  onToggleDevMode,
}: {
  workspaceOpen: boolean;
  devMode: boolean;
  isRunning: boolean;
  onToggleWorkspace: () => void;
  onToggleDevMode: () => void;
}) {
  return (
    <nav className="hidden md:flex w-12 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-app)]/82 backdrop-blur-sm flex-col items-center py-2 gap-1">
      <RailButton active={workspaceOpen} label="Explorer" onClick={onToggleWorkspace}>
        <Files size={20} />
      </RailButton>
      <RailButton label="Search">
        <Search size={20} />
      </RailButton>
      <RailButton label="Source Control">
        <GitBranch size={20} />
      </RailButton>
      <RailButton label="Run">
        <Bug size={20} />
      </RailButton>
      <RailButton label="Tests">
        <Beaker size={20} />
      </RailButton>
      <RailButton active={devMode} label="Insights" onClick={onToggleDevMode} pulse={isRunning}>
        <Code2 size={20} />
      </RailButton>
      <div className="flex-1" />
      <RailButton label="Settings">
        <Settings size={20} />
      </RailButton>
    </nav>
  );
}

function RailButton({
  active,
  pulse,
  label,
  children,
  onClick,
}: {
  active?: boolean;
  pulse?: boolean;
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        "relative w-10 h-10 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-main)] transition-all",
        active && "text-[var(--brand)]",
      )}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[var(--brand)] rail-marker" />}
      {pulse && <span className="absolute right-1.5 top-1.5 w-2 h-2 rounded-full bg-[var(--teal)] activity-dot" />}
      {children}
    </button>
  );
}

function PanelHeader({
  icon,
  title,
  actionIcon,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  actionIcon: React.ReactNode;
  onAction: () => void;
}) {
  return (
    <div className="h-10 border-b border-[var(--border)] px-3 flex items-center justify-between text-[11px] uppercase tracking-wider text-[var(--text-faint)] signal-line">
      <span className="inline-flex items-center gap-2">
        {icon}
        {title}
      </span>
      <button onClick={onAction} className="hover:text-[var(--text-main)] transition-colors" title="Collapse panel">
        {actionIcon}
      </button>
    </div>
  );
}

function ExplorerSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--border)]/70">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--text-faint)] hover:text-[var(--text-main)] transition-colors"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {title}
      </button>
      <div className={clsx("overflow-hidden panel-motion", open ? "max-h-96 opacity-100" : "max-h-0 opacity-0")}>{children}</div>
    </section>
  );
}

function FileTree() {
  return (
    <ul className="text-xs py-1">
      <FileRow active depth={0} label="docs/test-queries.txt" />
      <FileRow depth={0} label="frontend/" />
      <FileRow depth={1} label="src/App.tsx" />
      <FileRow depth={1} label="components/DeveloperPanel.tsx" />
      <FileRow depth={0} label="src/flow.py" />
      <FileRow depth={0} label="src/api.py" />
      <FileRow depth={0} label="src/state/sessions/" />
    </ul>
  );
}

function FileRow({ label, depth, active }: { label: string; depth: number; active?: boolean }) {
  return (
    <li
      className={clsx(
        "h-7 flex items-center gap-2 pr-2 text-[var(--text-dim)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-main)] transition-colors",
        active && "bg-[var(--brand)]/12 text-[var(--text-main)]",
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      <span className={clsx("w-1.5 h-1.5 rounded-full", active ? "bg-[var(--brand)] activity-dot" : "bg-[var(--border)]")} />
      <span className="truncate">{label}</span>
    </li>
  );
}

function ExecutionSurface({ isRunning, memoryActive }: { isRunning: boolean; memoryActive: boolean }) {
  return (
    <section className="border-b border-[var(--border)]/70 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] mb-2 flex items-center gap-1.5">
        <Layers3 size={11} />
        Execution Surface
      </p>
      <div className="space-y-2 text-xs">
        <LiveLane label="Planner" active={isRunning} color="var(--brand)" />
        <LiveLane label="Memory" active={memoryActive} color="var(--teal)" />
        <LiveLane label="Formatter" active={isRunning} color="var(--amber)" />
      </div>
    </section>
  );
}

function LiveLane({ label, active, color }: { label: string; active: boolean; color: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-2">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span className="h-1.5 rounded-full bg-[var(--bg-soft)] overflow-hidden signal-line">
        <span
          className={clsx("block h-full rounded-full meter-fill", active ? "opacity-100" : "opacity-35")}
          style={{ width: active ? "78%" : "24%", background: color }}
        />
      </span>
    </div>
  );
}

function CollapsedInsightsRail({ onOpen, isRunning }: { onOpen: () => void; isRunning: boolean }) {
  return (
    <button
      onClick={onOpen}
      className="w-12 h-full flex flex-col items-center py-3 gap-3 text-[var(--text-faint)] hover:text-[var(--brand)] transition-colors bg-[var(--bg-app)]/65"
      title="Expand developer insights"
    >
      <PanelRightOpen size={17} />
      <span className="vertical-label text-[10px] uppercase tracking-[0.22em]">Insights</span>
      {isRunning && <span className="mt-auto mb-2 w-2 h-2 rounded-full bg-[var(--teal)] activity-dot" />}
    </button>
  );
}

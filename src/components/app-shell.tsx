"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BackupNudge } from "./backup-nudge";
import { updateSettings, useMediaQuery, useSettings, WIDE_QUERY } from "@/lib/settings";
import { Modal } from "./modal";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { CloseIcon } from "./icons";
import { TabBar, useTabsSync } from "./tabs";
import { useEdgeSwipes } from "./use-gestures";
import { openSearch, SearchPanel } from "./search-panel";
import { StudyPanel } from "./study-panel";
import { AiWindow } from "./ai-window";
import { closePanel, useUi, type Panel } from "@/lib/ui-store";

/** Keeps the <html> dark class in sync with the saved theme (and the OS when "system"). */
function useThemeSync() {
  const { theme } = useSettings();
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  useThemeSync();
  useTabsSync();
  const { panel, toast } = useUi();
  const wide = useMediaQuery(WIDE_QUERY, true);
  const { panelWidth } = useSettings();
  // "/" opens search (desktop keyboard shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      openSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Phone: swipe in from the left edge for the library, up from the bottom edge for reading settings.
  useEdgeSwipes(
    () => setDrawerOpen(true),
    () => setSheetOpen(true),
  );

  return (
    <div className="flex h-dvh flex-col">
      <BackupNudge />
      <TopBar onOpenLibrary={() => setDrawerOpen(true)} sheetOpen={sheetOpen} setSheetOpen={setSheetOpen} />
      <TabBar />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-line bg-panel desk:block lg:w-80">
          <Sidebar />
        </aside>
        <main className="relative min-w-0 flex-1">{children}</main>
        {wide && panel && (
          <aside aria-label={PANEL_LABEL[panel]} style={{ width: panelWidth ?? 384 }} className="relative shrink-0 border-l border-line bg-panel">
            {/* Drag the left edge to make the panel wider or narrower (double-click: back to the default). */}
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startW = panelWidth ?? 384;
                const onMove = (ev: PointerEvent) =>
                  updateSettings({ panelWidth: Math.round(Math.min(window.innerWidth * 0.6, Math.max(300, startW - (ev.clientX - startX)))) });
                const onUp = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
              onDoubleClick={() => updateSettings({ panelWidth: null })}
              title="Drag to resize (double-click to reset)"
              aria-hidden
              className="absolute inset-y-0 -left-1 z-10 w-2 cursor-ew-resize hover:bg-accent/30"
            />
            <PanelBody panel={panel} />
          </aside>
        )}
      </div>

      <Modal open={!wide && !!panel} onClose={closePanel} variant="sheet" label={panel ? PANEL_LABEL[panel] : "Panel"}>
        <div className="h-[80dvh]">{panel && <PanelBody panel={panel} onNavigate={closePanel} />}</div>
      </Modal>

      <AiWindow />

      {toast && <Toast key={toast.id} text={toast.text} />}

      <Modal open={drawerOpen} onClose={() => setDrawerOpen(false)} variant="drawer" label="Library">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line py-1 pl-4 pr-1">
            <h2 className="font-serif text-lg font-semibold">Library</h2>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close library"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Toast in the browser's top layer (popover), so it shows above open dialogs too. */
function Toast({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { showPopover?: () => void }) | null;
    try {
      el?.showPopover?.();
    } catch {
      /* older browser: shown in normal flow */
    }
  }, []);
  return (
    <div
      ref={ref}
      popover="manual"
      role="status"
      aria-live="polite"
      className="toast pointer-events-none fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] m-0 mx-auto w-fit max-w-[90vw] rounded-full border-0 bg-ink px-4 py-2 text-center text-sm text-paper shadow-lg"
    >
      {text}
    </div>
  );
}

const PANEL_LABEL: Record<Exclude<Panel, null>, string> = { search: "Search", study: "My Study" };

function PanelBody({ panel, onNavigate }: { panel: Exclude<Panel, null>; onNavigate?: () => void }) {
  if (panel === "search") return <SearchPanel onNavigate={onNavigate} />;
  return <StudyPanel onNavigate={onNavigate} />;
}

export function ShellFallback() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="h-14 shrink-0 border-b border-line bg-panel" />
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-72 shrink-0 border-r border-line bg-panel desk:block lg:w-80" />
        <div className="flex-1" />
      </div>
    </div>
  );
}

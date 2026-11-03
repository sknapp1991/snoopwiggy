"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useMediaQuery, useSettings, WIDE_QUERY } from "@/lib/settings";
import { Modal } from "./modal";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { CloseIcon } from "./icons";
import { TabBar, useTabsSync } from "./tabs";
import { useEdgeSwipes } from "./use-gestures";
import { closeSearch, openSearch, SearchPanel, useSearchUi } from "./search-panel";

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
  const search = useSearchUi();
  const wide = useMediaQuery(WIDE_QUERY, true);
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
      <TopBar onOpenLibrary={() => setDrawerOpen(true)} sheetOpen={sheetOpen} setSheetOpen={setSheetOpen} />
      <TabBar />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-line bg-panel desk:block lg:w-80">
          <Sidebar />
        </aside>
        <main className="relative min-w-0 flex-1">{children}</main>
        {wide && search.open && (
          <aside aria-label="Search" className="w-96 shrink-0 border-l border-line bg-panel">
            <SearchPanel />
          </aside>
        )}
      </div>

      <Modal open={!wide && search.open} onClose={closeSearch} variant="sheet" label="Search">
        <div className="h-[80dvh]">
          <SearchPanel onNavigate={closeSearch} />
        </div>
      </Modal>

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

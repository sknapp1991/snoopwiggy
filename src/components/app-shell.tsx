"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import { Modal } from "./modal";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { CloseIcon } from "./icons";

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
  useThemeSync();

  return (
    <div className="flex h-dvh flex-col">
      <TopBar onOpenLibrary={() => setDrawerOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-line bg-panel md:block lg:w-80">
          <Sidebar />
        </aside>
        <main className="relative min-w-0 flex-1">{children}</main>
      </div>

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
        <div className="hidden w-72 shrink-0 border-r border-line bg-panel md:block lg:w-80" />
        <div className="flex-1" />
      </div>
    </div>
  );
}

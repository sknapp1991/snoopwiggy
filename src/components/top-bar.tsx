"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookIcon, CloseIcon, LanguagesIcon, MenuIcon, SlidersIcon } from "./icons";
import { FontSizeControl, ThemeToggle, VersionChooser, ViewToggle } from "./controls";
import { Modal } from "./modal";
import { useReaderState } from "./use-reader-state";

export function TopBar({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const { ref, entry, versions } = useReaderState();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 pt-[env(safe-area-inset-top)] md:px-4">
      <button
        type="button"
        onClick={onOpenLibrary}
        aria-label="Open library"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink md:hidden"
      >
        <MenuIcon />
      </button>

      <Link href="/" className="hidden items-center gap-2 pr-2 md:flex" aria-label="GlobalStudy home">
        <BookIcon className="text-accent" />
        <span className="font-serif text-lg font-semibold tracking-tight">GlobalStudy</span>
      </Link>

      {/* Phone: current location as the title; tap opens the library */}
      <button
        type="button"
        onClick={onOpenLibrary}
        className="min-w-0 flex-1 truncate text-left font-serif text-lg font-semibold md:hidden"
      >
        {entry ? `${entry.name} ${ref.chapter}` : "GlobalStudy"}
      </button>

      <div className="hidden flex-1 md:block" />

      {/* Desktop controls */}
      <div className="hidden items-center gap-2 md:flex">
        <VersionsPopover count={versions.length} />
        <ViewToggle />
        <FontSizeControl />
        <ThemeToggle />
      </div>

      {/* Phone: one settings button → bottom sheet */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Reading settings"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink md:hidden"
      >
        <SlidersIcon />
      </button>
      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} variant="sheet" label="Reading settings">
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <h2 className="font-semibold">Reading settings</h2>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Layout</h3>
              <ViewToggle full />
            </div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Text</h3>
              <div className="flex items-center gap-2">
                <FontSizeControl />
                <ThemeToggle />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Versions &amp; languages</h3>
              <VersionChooser />
            </div>
          </div>
        </div>
      </Modal>
    </header>
  );
}

function VersionsPopover({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-2 rounded-lg border border-line bg-raised px-3 text-sm hover:border-faint"
      >
        <LanguagesIcon width={18} height={18} className="text-accent" />
        Versions
        <span className="rounded-full bg-accent-soft px-1.5 text-xs font-semibold tabular-nums text-accent">{count}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Versions and languages"
          className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-96 overflow-y-auto rounded-xl border border-line bg-panel p-3 shadow-xl"
        >
          <VersionChooser />
        </div>
      )}
    </div>
  );
}

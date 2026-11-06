"use client";
import Link from "next/link";
import { chapterTitle } from "@/lib/catalog";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, LanguagesIcon, LibraryIcon, MenuIcon, SearchIcon, SlidersIcon } from "./icons";
import { HighlightModeToggle } from "./highlight-mode";
import { XrefToggle } from "./xref-panel";
import { togglePanel, useUi } from "@/lib/ui-store";
import { openSearch } from "./search-panel";
import { ChapterSwipeControl, SavedSetups, FontSizeControl, LanguageColors, ThemeToggle, VersionChooser, ViewToggle, WidthControl } from "./controls";
import { Modal } from "./modal";
import { useReaderState } from "./use-reader-state";
import { AiButton } from "./ai-window";
import { SaveOffline } from "./offline";
import { ListenTopButton } from "./audio-player";

export function TopBar({
  onOpenLibrary,
  sheetOpen,
  setSheetOpen,
}: {
  onOpenLibrary: () => void;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
}) {
  const { ref, entry, versions } = useReaderState();
  const { panel } = useUi();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 pt-[env(safe-area-inset-top)] md:px-4">
      <button
        type="button"
        onClick={onOpenLibrary}
        aria-label="Open library"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink desk:hidden"
      >
        <MenuIcon />
      </button>

      <Link href="/" className="hidden items-center gap-2 pr-2 desk:flex" aria-label="Verses Across home">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG logo */}
        <img src="/icon.svg" alt="" width={28} height={28} className="rounded-md" />
        <span className="font-serif text-lg font-semibold tracking-tight">
          <span className="text-[#b8935f]">Verses</span> <span className="text-[#5f8fc4]">Across</span>
        </span>
      </Link>

      {/* Phone: current location as the title; tap opens the library */}
      <button
        type="button"
        onClick={onOpenLibrary}
        className="min-w-0 flex-1 truncate text-left font-serif text-lg font-semibold desk:hidden"
      >
        {entry ? chapterTitle(entry, ref.chapter) : "Verses Across"}
      </button>

      <div className="hidden flex-1 desk:block" />

      <button
        type="button"
        onClick={() => openSearch()}
        aria-label="Search the text"
        title="Search (/)"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink desk:border desk:border-line desk:bg-raised"
      >
        <SearchIcon />
      </button>

      <ListenTopButton />

      <button
        type="button"
        onClick={() => togglePanel("study")}
        aria-label="My Study"
        aria-pressed={panel === "study"}
        title="My Study: favorites, notes, highlights"
        className={`flex h-11 w-11 items-center justify-center rounded-lg hover:bg-raised hover:text-ink desk:border desk:border-line ${
          panel === "study" ? "bg-accent-soft text-accent" : "text-muted desk:bg-raised"
        }`}
      >
        <LibraryIcon />
      </button>

      <XrefToggle />

      <AiButton />

      {/* Desktop controls */}
      <div className="hidden items-center gap-2 desk:flex">
        <HighlightModeToggle />
        <VersionsPopover count={versions.length} />
        <DisplayPopover />
        <ViewToggle />
        <FontSizeControl />
        <ThemeToggle />
      </div>

      {/* Phone: one settings button → bottom sheet */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Reading settings"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink desk:hidden"
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
            <SavedSetups />
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
            <HighlightModeToggle full />
            <XrefToggle full />
            <WidthControl />
            <LanguageColors />
            <ChapterSwipeControl />
            <SaveOffline />
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
          className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-96 space-y-4 overflow-y-auto rounded-xl border border-line bg-panel p-3 shadow-xl"
        >
          <SavedSetups />
          <VersionChooser />
        </div>
      )}
    </div>
  );
}

/** Desktop: reading width / column width and language colours. */
function DisplayPopover() {
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
        aria-label="Display options"
        title="Width & colours"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-raised text-muted hover:text-ink"
      >
        <SlidersIcon />
      </button>
      {open && (
        <div role="dialog" aria-label="Display options" className="absolute right-0 top-full z-30 mt-2 w-80 space-y-4 rounded-xl border border-line bg-panel p-4 shadow-xl">
          <SavedSetups />
          <WidthControl />
          <LanguageColors />
          <ChapterSwipeControl />
          <SaveOffline />
        </div>
      )}
    </div>
  );
}

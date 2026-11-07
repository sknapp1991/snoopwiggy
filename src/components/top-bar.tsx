"use client";
import Link from "next/link";
import { chapterTitle, findBook, readHref } from "@/lib/catalog";
import { toast } from "@/lib/ui-store";
import { useEffect, useRef, useState } from "react";
import { ChatIcon, CloseIcon, ShareIcon, LanguagesIcon, LibraryIcon, MenuIcon, PaletteIcon, SearchIcon, SlidersIcon } from "./icons";
import { HighlightModeToggle } from "./highlight-mode";
import { XrefToggle } from "./xref-panel";
import { closePanel, togglePanel, useUi } from "@/lib/ui-store";
import { openSearch } from "./search-panel";
import { ChapterSwipeControl, SavedSetups, FontSizeControl, LanguageColors, ThemeToggle, VersionChooser, ViewToggle, WidthControl } from "./controls";
import { Modal } from "./modal";
import { useReaderState } from "./use-reader-state";
import { AiButton } from "./ai-window";
import { SaveOffline } from "./offline";
import { ListenTopButton } from "./audio-player";
import { RedLetterToggle } from "./red-letter";
import { WordModeToggle } from "./word-study";
import { LevelMarksControl } from "./reading-levels";
import { ProgressButton } from "./progress-button";

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
    <header className="flex h-14 shrink-0 items-center gap-0 border-b min-[440px]:gap-2 border-line bg-panel px-2 pt-[env(safe-area-inset-top)] md:px-4">
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
        aria-label="Open library"
        className="min-w-0 flex-1 truncate text-left font-serif text-lg font-semibold desk:hidden"
      >
        {/* Narrow phones: the icons need the room (the chapter title is right below in the page). */}
        <span className="hidden min-[440px]:inline">{entry ? chapterTitle(entry, ref.chapter) : "Verses Across"}</span>
      </button>

      <div className="hidden flex-1 desk:block" />

      <button
        type="button"
        onClick={() => (panel === "search" ? closePanel() : openSearch())}
        aria-label="Search the text"
        aria-pressed={panel === "search"}
        title="Search (/)"
        className={`flex h-11 w-11 items-center justify-center rounded-lg hover:bg-raised hover:text-ink desk:border desk:border-line ${
          panel === "search" ? "bg-accent-soft text-accent" : "text-muted desk:bg-raised"
        }`}
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

      <ProgressButton />

      <XrefToggle />

      <AiButton />

      {/* Desktop controls */}
      <div className="hidden items-center gap-2 desk:flex">
        <HighlightModeToggle />
        <WordModeToggle />
        <VersionsPopover count={versions.length} />
        <TopPopover label="Colours" title="Text and language colours" icon={<PaletteIcon />}>
          <LanguageColors />
        </TopPopover>
        <TopPopover label="Display options" title="Saved setups, widths, swiping, offline" icon={<SlidersIcon />}>
          <SavedSetups />
          <RedLetterToggle />
          <LevelMarksControl />
          <WidthControl />
          <ChapterSwipeControl />
          <SaveOffline />
        </TopPopover>
        <TopPopover label="Read together" title="Read together: send a link to this exact spot" icon={<ShareIcon />}>
          <ReadTogether />
        </TopPopover>
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
            <WordModeToggle full />
            <XrefToggle full />
            <RedLetterToggle />
            <LevelMarksControl />
            <WidthControl />
            <LanguageColors />
            <ChapterSwipeControl />
            <SaveOffline />
            <ReadTogether />
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
          className="absolute right-0 top-full z-30 mt-2 max-h-[calc(100dvh-5rem)] w-96 space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-3 shadow-xl"
        >
          <SavedSetups />
          <VersionChooser />
        </div>
      )}
    </div>
  );
}

/**
 * A top-bar button with a pop-up under it: the button opens and closes it (like My Study), so does
 * Escape or a click outside. The pop-up never runs off the screen: it scrolls inside.
 */
function TopPopover({ label, title, icon, children }: { label: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
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
        aria-label={label}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 w-11 items-center justify-center rounded-lg border border-line ${open ? "bg-accent-soft text-accent" : "bg-raised text-muted hover:text-ink"}`}
      >
        {icon}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute right-0 top-full z-30 mt-2 max-h-[calc(100dvh-5rem)] w-80 space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-4 shadow-xl"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Placeholder for a future chat between readers. */
/** The verse at the top of the reading area (what a friend should land on), if any. */
function topVerse(): string | undefined {
  const els = document.querySelectorAll<HTMLElement>("[data-v]");
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.height && r.bottom > 120) return el.dataset.v;
  }
}

/**
 * Read together: a link that opens this chapter, in these versions, at the verse on screen. The friend
 * taps it and is at the same place; the talking happens in whatever app you send it with.
 */
function ReadTogether() {
  const { ref, versions } = useReaderState();
  const share = async () => {
    const v = topVerse();
    const url = window.location.origin + readHref(ref, versions, v && v !== "1" ? v : undefined);
    const where = `${chapterTitle(findBook(ref.work, ref.book), ref.chapter, ref.book)}${v && v !== "1" ? `:${v}` : ""}`;
    const text = `Read ${where} with me on Verses Across`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Read together", text, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}: ${url}`);
      toast("Link copied — paste it in a message to a friend");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };
  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <ShareIcon width={16} height={16} className="text-accent" /> Read together
      </p>
      <p className="text-muted">Send a friend a link to this exact spot: the same chapter, the same versions side by side, at the verse you’re on.</p>
      <button type="button" onClick={share} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 font-medium text-accent-ink">
        <ShareIcon width={16} height={16} /> Share this page
      </button>
      <p className="flex items-center gap-1.5 text-xs text-faint">
        <ChatIcon width={12} height={12} /> Chatting inside the site may come later.
      </p>
    </div>
  );
}


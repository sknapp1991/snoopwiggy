"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useSwipeToDismiss } from "./use-gestures";

/**
 * Native <dialog> modal: focus trap, Esc to close and inert background come for free.
 * variant "drawer" slides in from the left (mobile library); "sheet" rises from the bottom (mobile settings).
 */
export function Modal({
  open,
  onClose,
  variant,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** drawer: from the left; sheet: from the bottom; card: bottom sheet on phones, centred card on desktop. */
  variant: "drawer" | "sheet" | "card";
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Swipe the drawer left / the sheet down to close it (in addition to ✕, Esc and tapping outside).
  useSwipeToDismiss(ref, variant === "drawer" ? "left" : "down", onClose, open);

  const shape =
    variant === "drawer"
      ? "drawer m-0 h-dvh max-h-none w-[min(22rem,88vw)] max-w-none border-r border-line"
      : variant === "card"
        ? "sheet mt-auto mb-0 w-full max-w-none max-h-[85dvh] rounded-t-2xl border-t border-line pb-[env(safe-area-inset-bottom)] desk:m-auto desk:max-h-[80vh] desk:w-[30rem] desk:rounded-2xl desk:border desk:shadow-2xl"
        : "sheet mt-auto mb-0 w-full max-w-none max-h-[85dvh] rounded-t-2xl border-t border-line pb-[env(safe-area-inset-bottom)]";

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`${shape} bg-panel p-0 text-ink`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // backdrop click
      }}
    >
      {open ? children : null}
    </dialog>
  );
}

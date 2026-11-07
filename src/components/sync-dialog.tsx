"use client";
/**
 * Sync across devices: turn it on (get a code), or enter a code from another device. Shows the code as
 * text and as a QR code (a link that joins when opened), and lets you stop or delete the synced copy.
 */
import { useState, useSyncExternalStore } from "react";
import { deleteSyncedData, joinSync, syncNow, turnOffSync, turnOnSync, useSync } from "@/lib/sync";
import { toast } from "@/lib/ui-store";
import { CloseIcon } from "./icons";
import { Modal } from "./modal";
import { Qr } from "./qr";

let open = false;
const subs = new Set<() => void>();
const setOpen = (v: boolean) => {
  open = v;
  subs.forEach((l) => l());
};
export const openSyncDialog = () => setOpen(true);
const useOpen = () =>
  useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => open,
    () => false,
  );

export function SyncDialog() {
  const isOpen = useOpen();
  return (
    <Modal open={isOpen} onClose={() => setOpen(false)} variant="card" label="Sync across devices">
      {isOpen && <Body />}
    </Modal>
  );
}

export function syncSummary(s: ReturnType<typeof useSync>) {
  if (!s.on) return null;
  if (s.status === "syncing") return "Syncing…";
  if (s.status === "error") return s.error ?? "Sync problem";
  const ago = s.last ? Math.round((Date.now() - s.last) / 60000) : null;
  const when = ago == null ? "" : ago < 1 ? " · just now" : ago < 60 ? ` · ${ago} min ago` : ` · ${new Date(s.last).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  return `Synced${s.devices > 1 ? ` across ${s.devices} devices` : ""}${when}`;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast("Couldn’t copy");
  }
}

function Body() {
  const s = useSync();
  const [entering, setEntering] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const link = s.code ? `${location.origin}/#sync=${s.code}` : "";
  const btn = "min-h-11 rounded-xl px-4 text-sm";

  return (
    <div className="flex max-h-[85dvh] flex-col desk:max-h-[80vh]">
      <div className="flex items-center justify-between border-b border-line py-1 pl-4 pr-1">
        <h2 className="font-serif text-lg font-semibold">Sync across devices</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised">
          <CloseIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 text-sm">
        {!s.on ? (
          <>
            <p className="text-muted">
              Keep your notes, highlights, favorites, plans, goals, progress and settings the same on your phone, tablet and
              computer, and safe if this browser is cleared. No account, email or name: a private code is the key.
            </p>
            <p className="text-muted">
              Everything is locked (encrypted) on your device before it’s uploaded, so nobody else, including us, can read it.
            </p>
            {!entering ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await turnOnSync();
                    setBusy(false);
                  }}
                  className={`${btn} w-full bg-accent font-medium text-accent-ink disabled:opacity-60`}
                >
                  {busy ? "Turning on…" : "Turn on sync"}
                </button>
                <button type="button" onClick={() => setEntering(true)} className={`${btn} w-full border border-line text-ink hover:bg-raised`}>
                  I have a code from another device
                </button>
              </div>
            ) : (
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setErr(await joinSync(input));
                  setBusy(false);
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                  aria-label="Sync code"
                  className="block h-11 w-full rounded-lg border border-line bg-raised px-3 font-mono text-base tracking-wider outline-none focus:ring-2 focus:ring-accent/50"
                />
                {err && <p role="alert" className="text-sm text-ink">{err}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={busy || !input.trim()} className={`${btn} flex-1 bg-accent font-medium text-accent-ink disabled:opacity-60`}>
                    {busy ? "Connecting…" : "Connect"}
                  </button>
                  <button type="button" onClick={() => setEntering(false)} className={`${btn} text-muted hover:bg-raised`}>
                    Back
                  </button>
                </div>
                <p className="text-xs text-faint">Anything already on this device is kept and combined with what’s synced.</p>
              </form>
            )}
          </>
        ) : (
          <>
            <p className={s.status === "error" ? "text-ink" : "text-muted"} role="status">
              {s.status === "ok" ? "✓ " : ""}
              {syncSummary(s)}
            </p>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-line px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Your sync code</p>
              <p className="select-all text-center font-mono text-base tracking-wider text-ink">{s.code}</p>
              <Qr text={link} label="QR code that connects another device to your sync" />
              <p className="text-center text-xs text-muted">
                On another device: scan this with the camera, or open Verses Across → My Study → Sync and type the code.
              </p>
              <div className="flex w-full gap-2">
                <button type="button" onClick={() => copy(s.code!, "Code")} className={`${btn} flex-1 border border-line text-ink hover:bg-raised`}>
                  Copy code
                </button>
                <button type="button" onClick={() => copy(link, "Link")} className={`${btn} flex-1 border border-line text-ink hover:bg-raised`}>
                  Copy link
                </button>
              </div>
            </div>
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-ink">
              <strong>Keep this code somewhere safe</strong>, for example in your password manager or a note. It’s the only way
              back to your data, and anyone who has it can see your notes, so share it only with your own devices.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void syncNow()} disabled={s.status === "syncing"} className={`${btn} flex-1 border border-line text-ink hover:bg-raised disabled:opacity-60`}>
                Sync now
              </button>
              <button
                type="button"
                onClick={() => {
                  turnOffSync();
                  toast("Sync turned off on this device");
                }}
                className={`${btn} flex-1 border border-line text-ink hover:bg-raised`}
              >
                Stop syncing here
              </button>
            </div>
            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-faint underline underline-offset-2 hover:text-muted">
                Delete the synced copy…
              </button>
            ) : (
              <div className="space-y-2 rounded-lg border border-line px-3 py-2 text-xs">
                <p className="text-ink">
                  This removes your data from the sync server for good. It stays on each device, but they stop syncing. Continue?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteSyncedData();
                      toast("Synced copy deleted");
                    }}
                    className={`${btn} bg-ink font-medium text-paper`}
                  >
                    Delete it
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={`${btn} text-muted hover:bg-raised`}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

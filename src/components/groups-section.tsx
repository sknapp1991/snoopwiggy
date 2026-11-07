"use client";
/**
 * Study groups in the Progress panel: create one, invite friends (link, code or QR), see everyone's
 * streak, time this week and progress in the group's book. Plus the prompt shown when an invite link
 * is opened.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { chapterTitle, findBook, readHref, DEFAULT_VERSIONS } from "@/lib/catalog";
import {
  bookLabel,
  createGroup,
  inviteLink,
  joinGroup,
  leaveGroup,
  loadGroup,
  pendingInvite,
  updateMeta,
  updateMyGroup,
  useGroups,
  type GroupView,
  type MyGroup,
} from "@/lib/groups";
import { toast } from "@/lib/ui-store";
import { CloseIcon } from "./icons";
import { Modal } from "./modal";
import { Qr } from "./qr";
import { useReaderState } from "./use-reader-state";

const NAME_KEY = "va-group-name";
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};
const rememberName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
};
const field = "h-10 w-full rounded-lg border border-line bg-raised px-3 text-base outline-none focus:ring-2 focus:ring-accent/50 md:text-sm";
const btn = "min-h-10 rounded-lg px-3 text-sm";

export function GroupsSection() {
  const groups = useGroups();
  const [mode, setMode] = useState<null | "create" | "join">(null);
  return (
    <section className="space-y-2" aria-label="Study groups">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Study groups</h3>
      {groups.length === 0 && !mode && (
        <p className="text-sm text-muted">Study with friends or family: see each other’s streaks and progress, and read a book together. No accounts.</p>
      )}
      {groups.map((g) => (
        <GroupCard key={g.code} g={g} />
      ))}
      {mode === "create" ? (
        <CreateForm onDone={() => setMode(null)} />
      ) : mode === "join" ? (
        <JoinForm onDone={() => setMode(null)} />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("create")} className={`${btn} flex-1 border border-dashed border-line text-muted hover:bg-raised hover:text-ink`}>
            + New group
          </button>
          <button type="button" onClick={() => setMode("join")} className={`${btn} flex-1 border border-dashed border-line text-muted hover:bg-raised hover:text-ink`}>
            Join with a code
          </button>
        </div>
      )}
    </section>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const { ref } = useReaderState();
  const book = findBook(ref.work, ref.book);
  const [name, setName] = useState("");
  const [me, setMe] = useState(savedName);
  const [withBook, setWithBook] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="space-y-2 rounded-xl border border-line bg-raised/50 p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!me.trim()) return setErr("Add the name the group will see.");
        setBusy(true);
        try {
          rememberName(me.trim());
          await createGroup(name, me, withBook && book ? { work: ref.work, book: ref.book } : null);
          toast("Group created. Invite people with the link");
          onDone();
        } catch (x) {
          setErr((x as Error).message);
        }
        setBusy(false);
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. Family Bible study" aria-label="Group name" maxLength={60} className={field} autoFocus />
      <input value={me} onChange={(e) => setMe(e.target.value)} placeholder="Your name in the group" aria-label="Your name in the group" maxLength={40} className={field} />
      {book && (
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" checked={withBook} onChange={(e) => setWithBook(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Read {book.name} together (everyone’s progress in it is shown)
        </label>
      )}
      {err && <p role="alert" className="text-ink">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`${btn} flex-1 bg-accent font-medium text-accent-ink disabled:opacity-60`}>
          {busy ? "Creating…" : "Create group"}
        </button>
        <button type="button" onClick={onDone} className={`${btn} text-muted hover:bg-raised`}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function JoinForm({ onDone, code }: { onDone: () => void; code?: string }) {
  const [input, setInput] = useState(code ?? "");
  const [me, setMe] = useState(savedName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="space-y-2 rounded-xl border border-line bg-raised/50 p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!me.trim()) return setErr("Add the name the group will see.");
        setBusy(true);
        rememberName(me.trim());
        const r = await joinGroup(input, me);
        setBusy(false);
        if (r) return setErr(r);
        toast("You joined the group");
        onDone();
      }}
    >
      {!code && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Group code or invite link"
          aria-label="Group code or invite link"
          autoComplete="off"
          spellCheck={false}
          className={`${field} font-mono`}
          autoFocus
        />
      )}
      <input value={me} onChange={(e) => setMe(e.target.value)} placeholder="Your name in the group" aria-label="Your name in the group" maxLength={40} className={field} autoFocus={!!code} />
      <p className="text-xs text-faint">The group sees your name, streak, time read this week and progress in the group’s book. You can turn that off after joining.</p>
      {err && <p role="alert" className="text-ink">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`${btn} flex-1 bg-accent font-medium text-accent-ink disabled:opacity-60`}>
          {busy ? "Joining…" : "Join group"}
        </button>
        <button type="button" onClick={onDone} className={`${btn} text-muted hover:bg-raised`}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return "now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function GroupCard({ g }: { g: MyGroup }) {
  const { ref } = useReaderState();
  const [view, setView] = useState<GroupView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [settings, setSettings] = useState(false);
  const refresh = useCallback(
    (publishFirst = true) =>
      loadGroup(g, { publishFirst })
        .then((v) => {
          setView(v);
          setErr(null);
        })
        .catch((e) => setErr((e as Error).message)),
    [g],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const book = view?.meta?.book ?? null;
  const here = findBook(ref.work, ref.book);

  return (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink">{view?.meta?.name ?? g.name}</span>
          <span className="block text-xs text-muted">
            {view ? `${view.members.length} ${view.members.length === 1 ? "person" : "people"}` : err ? err : "Loading…"}
            {book ? ` · reading ${bookLabel(book)}` : ""}
          </span>
        </span>
        <span className="text-faint" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-2 text-sm">
          {view && (
            <ul className="divide-y divide-line/70">
              {view.members.map((m) => (
                <li key={m.id} className="py-2">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-ink">
                      {m.name}
                      {m.mine ? " (you)" : ""}
                    </span>
                    <span className="shrink-0 text-[11px] text-faint">{ago(m.at)}</span>
                  </p>
                  {m.weekMins != null ? (
                    <p className="text-xs text-muted">
                      🔥 {m.streak ?? 0} · {m.weekMins} min this week · {m.weekChapters ?? 0} {m.weekChapters === 1 ? "chapter" : "chapters"}
                      {book && m.book ? ` · ${bookLabel(book)} ${m.book.done}/${m.book.total}` : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-faint">Progress not shared</p>
                  )}
                  {book && m.book && m.book.total > 0 && (
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${(m.book.done / m.book.total) * 100}%` }} />
                    </span>
                  )}
                  {m.reading && !m.mine && (
                    <Link
                      href={readHref({ work: m.reading.work, book: m.reading.book, chapter: m.reading.chapter }, DEFAULT_VERSIONS[m.reading.work] ?? [])}
                      className="mt-0.5 block text-xs text-accent underline-offset-2 hover:underline"
                    >
                      Reading {chapterTitle(findBook(m.reading.work, m.reading.book), m.reading.chapter, m.reading.book)}: join them
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowInvite(!showInvite)} className={`${btn} flex-1 border border-line text-ink hover:bg-raised`}>
              Invite
            </button>
            <button type="button" onClick={() => void refresh()} className={`${btn} border border-line text-ink hover:bg-raised`}>
              Refresh
            </button>
            <button type="button" onClick={() => setSettings(!settings)} className={`${btn} border border-line text-ink hover:bg-raised`}>
              Settings
            </button>
          </div>

          {showInvite && <Invite g={g} />}

          {settings && (
            <div className="space-y-2 rounded-lg border border-line px-3 py-2">
              <label className="block space-y-1">
                <span className="text-xs text-muted">Your name in this group</span>
                <input
                  defaultValue={g.me}
                  maxLength={40}
                  onBlur={(e) => {
                    const me = e.target.value.trim();
                    if (me && me !== g.me) {
                      updateMyGroup(g.code, { me });
                      setTimeout(() => void refresh(), 0);
                    }
                  }}
                  className={field}
                />
              </label>
              <label className="flex items-center gap-2 text-muted">
                <input
                  type="checkbox"
                  checked={g.share.progress}
                  onChange={(e) => {
                    updateMyGroup(g.code, { share: { ...g.share, progress: e.target.checked } });
                    setTimeout(() => void refresh(), 0);
                  }}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Share my streak, time and progress
              </label>
              <label className="flex items-center gap-2 text-muted">
                <input
                  type="checkbox"
                  checked={g.share.reading}
                  onChange={(e) => {
                    updateMyGroup(g.code, { share: { ...g.share, reading: e.target.checked } });
                    setTimeout(() => void refresh(), 0);
                  }}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Show which chapter I’m reading (so others can join)
              </label>
              {view?.meta && here && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await updateMeta(g, { ...view.meta!, book: { work: ref.work, book: ref.book } }, view.metaEtag);
                      toast(`The group is now reading ${here.name}`);
                      void refresh();
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                  className={`${btn} w-full border border-line text-ink hover:bg-raised`}
                >
                  Read {here.name} together
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  await leaveGroup(g);
                  toast("You left the group");
                }}
                className="text-xs text-faint underline underline-offset-2 hover:text-muted"
              >
                Leave this group
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Invite({ g }: { g: MyGroup }) {
  const link = inviteLink(g);
  const share = async () => {
    const text = `Join my study group “${g.name}” on Verses Across`;
    if (navigator.share) {
      try {
        await navigator.share({ title: g.name, text, url: link });
        return;
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}: ${link}`);
      toast("Invite link copied");
    } catch {
      toast("Couldn’t copy");
    }
  };
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-line px-3 py-3">
      <Qr text={link} size={140} label="QR code to join this group" />
      <p className="select-all text-center font-mono text-xs tracking-wider text-ink">{g.code}</p>
      <button type="button" onClick={share} className={`${btn} w-full bg-accent font-medium text-accent-ink`}>
        Share invite link
      </button>
      <p className="text-center text-xs text-faint">Anyone with the link or code can join and see the group, so share it only with people you know.</p>
    </div>
  );
}

/** Opened an invite link (#group=CODE): offer to join. */
export function GroupInvite() {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const c = pendingInvite();
    if (!c) return;
    history.replaceState(null, "", location.pathname + location.search);
    const t = setTimeout(() => setCode(c), 300); // after the reader has settled
    return () => clearTimeout(t);
  }, []);
  return (
    <Modal open={!!code} onClose={() => setCode(null)} variant="card" label="Join a study group">
      {code && (
        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold">Join a study group</h2>
            <button type="button" onClick={() => setCode(null)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-raised">
              <CloseIcon />
            </button>
          </div>
          <p className="text-sm text-muted">You were invited to read together on Verses Across. Pick the name the group will see.</p>
          <JoinForm code={code} onDone={() => setCode(null)} />
        </div>
      )}
    </Modal>
  );
}

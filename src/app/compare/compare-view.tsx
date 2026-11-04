"use client";
/**
 * Side-by-side review of AI translation candidates (scripts/compare-translations.ts →
 * public/compare/results.json). "Blind" hides model names behind letters in a fixed
 * shuffled order per language, so the choice isn't swayed by brand.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type V = { v: string; t: string };
type Entry = { verses: V[]; ms?: number } | { error: string };
type Results = {
  source: string;
  samples: { id: string; reference: string; genre: string }[];
  langs: { code: string; name: string; note?: string; native?: string }[];
  providers: Record<string, { label: string; kind: string }>;
  english: Record<string, V[]>;
  native: Record<string, Record<string, { version: string; verses: V[] }>>;
  translations: Record<string, Record<string, Record<string, Entry>>>;
};

const RTL = new Set(["he", "ar"]);

function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
  return items.map((x) => ({ x, r: rand() })).sort((a, b) => a.r - b.r).map((p) => p.x);
}

export function CompareView() {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState("es");
  const [sample, setSample] = useState("psa23");
  const [blind, setBlind] = useState(true);

  useEffect(() => {
    fetch("/compare/results.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const providers = useMemo(() => {
    if (!data) return [];
    const ids = Object.keys(data.providers).filter((id) => data.translations[id]?.[lang]?.[sample]);
    return seededOrder(ids, lang);
  }, [data, lang, sample]);

  if (error) return <p className="p-8">Couldn’t load results ({error}).</p>;
  if (!data) return <p className="p-8 text-muted">Loading…</p>;

  const l = data.langs.find((x) => x.code === lang)!;
  const s = data.samples.find((x) => x.id === sample)!;
  const english = data.english[sample] ?? [];
  const native = data.native[lang]?.[sample];
  const dir = RTL.has(lang) ? "rtl" : "ltr";
  const name = (id: string, i: number) => (blind ? `Translation ${String.fromCharCode(65 + i)}` : data.providers[id].label);

  const cols: { key: string; title: string; sub?: string; verses?: V[]; error?: string; target: boolean }[] = [
    { key: "en", title: `English source`, sub: data.source, verses: english, target: false },
    ...(native ? [{ key: "native", title: `Published ${l.name}`, sub: native.version, verses: native.verses, target: true }] : []),
    ...providers.map((id, i) => {
      const e = data.translations[id][lang][sample];
      return {
        key: id,
        title: name(id, i),
        sub: blind ? "AI translation" : `AI · ${"ms" in e && e.ms ? `${(e.ms / 1000).toFixed(0)}s` : data.providers[id].kind}`,
        verses: "verses" in e ? e.verses : undefined,
        error: "error" in e ? e.error : undefined,
        target: true,
      };
    }),
  ];

  return (
    <div className="h-dvh overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <Link href="/" className="text-sm text-accent underline-offset-2 hover:underline">
          ← Verses Across
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-semibold">AI translation comparison</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          The same English passages ({data.source}) translated by each candidate. Read them in blind mode first, pick the
          best per language, then reveal the names.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {data.langs.map((x) => (
            <button
              key={x.code}
              type="button"
              onClick={() => setLang(x.code)}
              aria-pressed={lang === x.code}
              className={`min-h-11 rounded-lg border px-3 text-sm ${
                lang === x.code ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-raised"
              }`}
            >
              {x.note ?? x.name}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {data.samples.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setSample(x.id)}
              aria-pressed={sample === x.id}
              className={`min-h-11 rounded-lg border px-3 text-sm ${
                sample === x.id ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-raised"
              }`}
            >
              {x.reference} <span className="text-faint">· {x.genre}</span>
            </button>
          ))}
          <label className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-raised px-3 text-sm">
            <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Blind (hide model names)
          </label>
        </div>

        <h2 className="mt-6 font-serif text-xl font-semibold">
          {s.reference} — {l.note ?? l.name}
        </h2>

        {/* Desktop: aligned grid. Phone: one card per verse. */}
        <div
          className="mt-3 hidden overflow-x-auto md:grid"
          style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(14rem, 1fr))` }}
        >
          {cols.map((c) => (
            <div key={c.key} className="sticky top-0 border-b border-line bg-paper px-3 py-2 text-sm">
              <div className="font-semibold">{c.title}</div>
              <div className="text-xs text-faint">{c.sub}</div>
              {c.error && <div className="mt-1 text-xs text-red-600">Failed: {c.error.slice(0, 120)}</div>}
            </div>
          ))}
          {english.map((ev) =>
            cols.map((c) => {
              const t = c.verses?.find((x) => x.v === ev.v)?.t;
              return (
                <div
                  key={`${c.key}-${ev.v}`}
                  lang={c.target ? lang : "en"}
                  dir={c.target ? dir : "ltr"}
                  className={`border-b border-line/60 px-3 py-2 font-serif leading-relaxed ${c.key === "en" ? "text-muted" : ""}`}
                >
                  <sup className="mr-1 font-sans text-[0.7em] font-semibold text-accent">{ev.v}</sup>
                  {t ?? <span className="text-faint">—</span>}
                </div>
              );
            }),
          )}
        </div>

        <ol className="mt-3 space-y-4 md:hidden">
          {english.map((ev) => (
            <li key={ev.v} className="rounded-xl border border-line bg-raised p-3">
              {cols.map((c) => {
                const t = c.verses?.find((x) => x.v === ev.v)?.t;
                return (
                  <div key={c.key} className="py-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                      {ev.v} · {c.title}
                    </div>
                    <div lang={c.target ? lang : "en"} dir={c.target ? dir : "ltr"} className={`font-serif ${c.key === "en" ? "text-muted" : ""}`}>
                      {t ?? <span className="text-faint">{c.error ? "Failed" : "—"}</span>}
                    </div>
                  </div>
                );
              })}
            </li>
          ))}
        </ol>

        {!blind && (
          <p className="mt-6 text-xs text-faint">
            Providers:{" "}
            {Object.entries(data.providers)
              .map(([, p]) => p.label)
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

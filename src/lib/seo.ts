/**
 * Server-only search-engine metadata for chapter pages: title, description, main address (canonical),
 * link-preview image and structured data (breadcrumbs).
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { DEFAULT_VERSIONS, getVersion, parseVersionParam, sortVersions, versionsForWork } from "./catalog";
import type { Chapter, Verse, Version } from "./schema";
import { chapterPath, joinAbbrs, ogImagePath, parseChapter, seoChapterName, seoVersions, SITE, snippet } from "./seo-shared";

type BookFile = { chapters: Record<string, { verses: Verse[]; title?: string; note?: string }> };

// Books recently read on this server instance (a book file holds every chapter; Psalms is the largest).
const cache = new Map<string, Promise<BookFile | null>>();

async function fetchBook(work: string, version: string, book: string): Promise<BookFile | null> {
  const rel = `/texts/${work}/${version}/${book}.json`;
  // On Cloudflare: the static files binding (no trip out to the internet).
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const assets = (getCloudflareContext().env as unknown as { ASSETS?: { fetch: (r: Request) => Promise<Response> } }).ASSETS;
    if (assets) {
      const res = await assets.fetch(new Request(`${SITE}${rel}`));
      if (res.ok) return (await res.json()) as BookFile;
    }
  } catch {
    /* not on Cloudflare */
  }
  // `next start` / `next dev` on this computer: ask the same server for the static file.
  try {
    const h = await headers();
    const host = h.get("host");
    if (!host) return null;
    const res = await fetch(`${h.get("x-forwarded-proto") ?? "http"}://${host}${rel}`);
    return res.ok ? ((await res.json()) as BookFile) : null;
  } catch {
    return null;
  }
}

/** One chapter of one version, read on the server (null when missing). */
export async function loadChapterServer(work: string, version: string, book: string, chapter: number) {
  const key = `${work}/${version}/${book}`;
  let p = cache.get(key);
  if (!p) {
    p = fetchBook(work, version, book);
    cache.set(key, p);
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
    p.then((b) => b || cache.delete(key));
  }
  return (await p)?.chapters[String(chapter)] ?? null;
}

/** ?v=kjv,rvr1909 → those versions (for link previews of shared links); otherwise the defaults. */
function versionsFor(work: string, v: string | undefined): Version[] {
  const picked = (v ?? "")
    .split(",")
    .map((id) => getVersion(id.trim()))
    .filter((x): x is Version => !!x && x.work === work);
  return picked.length ? picked.slice(0, 4) : seoVersions(work);
}

export async function chapterMetadata(work: string, book: string, chapter: string, v?: string): Promise<Metadata> {
  const ref = parseChapter(work, book, chapter);
  if (!ref) return { robots: { index: false } };
  const versions = versionsFor(work, v);
  const name = seoChapterName(ref.entry, ref.chapter);
  const title = `${name} – ${joinAbbrs(versions)}`;
  const [t, w] = name.split(" · ");
  const named = w ? `${t} (${w.replace(/\s*\((.*?)\)/, ", $1")})` : t; // "John 3 (Holy Bible)", "SN 12.2 (Pali Canon, Tipiṭaka)"
  // A first verse makes the search result read like the text itself.
  const lead = versions.find((x) => x.language === "en") ?? versions[0];
  const text = lead ? await loadChapterServer(work, lead.id, book, ref.chapter) : null;
  const first = text?.verses.find((x) => x.t)?.t;
  const names = versions.map((x) => x.name).join(", ");
  const tail = `${named} in ${names.length < 90 ? names : joinAbbrs(versions)}${versions.length > 1 ? ", side by side" : ""}. Free, no ads, no sign-up.`;
  const description = first ? `“${snippet(first)}” ${tail}` : `Read ${tail}`;
  const url = chapterPath(ref);
  const image = { url: ogImagePath(ref), width: 1200, height: 630, alt: `${ref.entry.name} on Verses Across` };
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", siteName: "Verses Across", title, description, url, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** Structured data: breadcrumbs (Verses Across › Book › Chapter) shown under the result in Google. */
export function chapterJsonLd(work: string, book: string, chapter: string) {
  const ref = parseChapter(work, book, chapter);
  if (!ref) return null;
  const name = seoChapterName(ref.entry, ref.chapter);
  const bookUrl = `${SITE}${chapterPath({ ...ref, chapter: 1 })}`;
  const url = `${SITE}${chapterPath(ref)}`;
  const crumbs = [
    { name: "Verses Across", item: `${SITE}/` },
    ...(ref.entry.chapters! > 1 ? [{ name: ref.entry.name, item: bookUrl }] : []),
    { name, item: url },
  ];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
      },
      {
        "@type": "WebPage",
        "@id": url,
        url,
        name,
        isPartOf: { "@type": "WebSite", name: "Verses Across", url: `${SITE}/` },
        about: { "@type": "Book", name: ref.entry.name, genre: `${ref.entry.religion.name} · ${ref.entry.collection.name}` },
        inLanguage: seoVersions(work).map((x) => x.language),
        isAccessibleForFree: true,
      },
    ],
  };
}

/**
 * The chapter text the reader shows first (the ?v= versions, else the defaults), loaded on the server so
 * the page's HTML already has the verses. Mirrors useReaderState: no saved choices exist on the server.
 */
export async function initialChapters(work: string, book: string, chapter: string, v?: string): Promise<Chapter[]> {
  const ref = parseChapter(work, book, chapter);
  if (!ref) return [];
  const fromUrl = parseVersionParam(work, v);
  const ids = fromUrl.length ? fromUrl : sortVersions(DEFAULT_VERSIONS[work] ?? versionsForWork(work).slice(0, 1).map((x) => x.id));
  const loaded = await Promise.all(
    ids.map(async (id) => {
      const c = await loadChapterServer(work, id, book, ref.chapter);
      return c ? ({ work, version: id, book, chapter: ref.chapter, ...c } as Chapter) : null;
    }),
  );
  return loaded.filter((c): c is Chapter => !!c);
}

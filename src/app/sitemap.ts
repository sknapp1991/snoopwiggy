import type { MetadataRoute } from "next";
import { booksOfWork, catalog } from "@/lib/catalog";
import { chapterPath, SITE } from "@/lib/seo-shared";

/** Every chapter's main address (no ?v=), so search engines can find all ~27k pages. Built once at build time. */
export default function sitemap(): MetadataRoute.Sitemap {
  const urls: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, priority: 1 },
    { url: `${SITE}/about`, priority: 0.5 },
  ];
  for (const w of catalog.works)
    for (const b of booksOfWork(w.id))
      for (let c = 1; c <= b.chapters!; c++) urls.push({ url: `${SITE}${chapterPath({ work: w.id, book: b.id, chapter: c })}` });
  return urls;
}

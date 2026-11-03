"use client";
import { useCallback, useMemo } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_LOCATION,
  DEFAULT_VERSIONS,
  findBook,
  parseVersionParam,
  sortVersions,
  versionsForWork,
  type BookRef,
} from "@/lib/catalog";
import { updateSettings, useSettings } from "@/lib/settings";

/** Current location (from the URL path) and selected versions (from ?v=, else saved, else defaults). */
export function useReaderState() {
  const params = useParams<{ work?: string; book?: string; chapter?: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const settings = useSettings();

  const work = params.work ?? DEFAULT_LOCATION.work;
  const book = params.book ?? DEFAULT_LOCATION.book;
  const chapter = params.chapter ? Number(params.chapter) : DEFAULT_LOCATION.chapter;
  const ref: BookRef = useMemo(() => ({ work, book, chapter }), [work, book, chapter]);
  const entry = findBook(work, book);
  const vParam = search.get("v");
  const savedForWork = settings.versions[work];

  const versions = useMemo(() => {
    // The user's own order (URL, else saved) is kept as-is; only the defaults use catalog order.
    const fromUrl = parseVersionParam(work, vParam);
    if (fromUrl.length) return fromUrl;
    const saved = parseVersionParam(work, savedForWork?.join(","));
    if (saved.length) return saved;
    const defaults = DEFAULT_VERSIONS[work] ?? versionsForWork(work).slice(0, 1).map((v) => v.id);
    return sortVersions(defaults);
  }, [work, vParam, savedForWork]);

  const setVersions = useCallback(
    (ids: string[]) => {
      const next = [...new Set(ids)];
      if (!next.length) return;
      updateSettings({ versions: { ...settings.versions, [work]: next } });
      router.replace(`${pathname}?v=${next.join(",")}${window.location.hash}`, { scroll: false });
    },
    [router, pathname, settings.versions, work],
  );

  return { ref, entry, versions, setVersions };
}

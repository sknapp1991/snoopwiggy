"use client";
/** Open where you left off (last book/chapter and versions on this device), else Genesis 1. */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DEFAULT_LOCATION, readHref, type BookRef } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const s = getSettings();
    const recent = s.tabsRecent[0];
    const tab = s.tabs.find((t) => t.startsWith(`${recent}/`)) ?? s.tabs[s.tabs.length - 1];
    let ref: BookRef = DEFAULT_LOCATION;
    if (tab) {
      const [work, book, ch] = tab.split("/");
      if (work && book && Number(ch) > 0) ref = { work, book, chapter: Number(ch) };
    }
    router.replace(readHref(ref, s.versions[ref.work]));
  }, [router]);
  return <div className="h-dvh bg-paper" aria-busy="true" />;
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { ReaderFallback, ReaderView } from "@/components/reader";
import { ChapterSeed } from "@/lib/chapter-store";
import { chapterJsonLd, chapterMetadata, initialChapters } from "@/lib/seo";

type Props = PageProps<"/read/[work]/[book]/[chapter]">;
const vOf = (sp: Record<string, string | string[] | undefined>) => (typeof sp.v === "string" ? sp.v : undefined);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ work, book, chapter }, sp] = await Promise.all([params, searchParams]);
  return chapterMetadata(work, book, chapter, vOf(sp));
}

export default async function ReadPage({ params, searchParams }: Props) {
  const [{ work, book, chapter }, sp] = await Promise.all([params, searchParams]);
  const ld = chapterJsonLd(work, book, chapter);
  // The first versions' text comes with the page (search engines read it; the reader shows it at once).
  const chapters = await initialChapters(work, book, chapter, vOf(sp));
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      <ChapterSeed chapters={chapters}>
        <Suspense fallback={<ReaderFallback />}>
          <ReaderView />
        </Suspense>
      </ChapterSeed>
    </>
  );
}

import { Suspense } from "react";
import { ReaderFallback, ReaderView } from "@/components/reader";

export default function ReadPage() {
  return (
    <Suspense fallback={<ReaderFallback />}>
      <ReaderView />
    </Suspense>
  );
}

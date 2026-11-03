import { Suspense } from "react";
import { AppShell, ShellFallback } from "@/components/app-shell";

/** The shell reads the URL (book, chapter, ?v=) on the client, so it streams inside Suspense. */
export default function ReadLayout({ children }: LayoutProps<"/read">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

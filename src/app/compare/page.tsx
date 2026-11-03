import type { Metadata } from "next";
import { CompareView } from "./compare-view";

export const metadata: Metadata = {
  title: "AI translation comparison",
  robots: { index: false },
};

export default function ComparePage() {
  return <CompareView />;
}

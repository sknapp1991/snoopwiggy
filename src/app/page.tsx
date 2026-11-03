import { redirect } from "next/navigation";
import { DEFAULT_LOCATION, readHref } from "@/lib/catalog";

export default function Home() {
  redirect(readHref(DEFAULT_LOCATION));
}

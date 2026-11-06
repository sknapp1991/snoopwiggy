import type { MetadataRoute } from "next";

/** "Add to Home Screen" / install, and the Android app (a Trusted Web Activity of this site). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Verses Across",
    short_name: "Verses Across",
    description:
      "Read the world's scriptures side by side, in many languages: the Bible, Quran, Torah, Gita, Dhammapada and more. Audio read-aloud, word study, cross references. Free, no ads.",
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fbfaf7",
    theme_color: "#1f3a5f",
    categories: ["books", "education", "reference"],
    prefer_related_applications: false,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Verse of the day", url: "/", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "John 3", url: "/read/bible/jhn/3", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

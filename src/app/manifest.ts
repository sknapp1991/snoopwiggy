import type { MetadataRoute } from "next";

/** "Add to Home Screen" / install: name, icons and colours. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Verses Across",
    short_name: "Verses Across",
    description: "Read the world's scriptures side by side, in many languages. Free on phone and desktop.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#1f3a5f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

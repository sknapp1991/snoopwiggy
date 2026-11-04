import type { MetadataRoute } from "next";

/** "Add to Home Screen" / install: name, icons and colours. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VersesAcross",
    short_name: "VersesAcross",
    description: "Study the world's scriptures side by side, in many languages.",
    start_url: "/",
    display: "standalone",
    background_color: "#15130f",
    theme_color: "#b45309",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

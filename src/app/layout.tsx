import type { Metadata, Viewport } from "next";
import { Inter, Noto_Naskh_Arabic, Noto_Serif, Noto_Serif_Hebrew, Source_Serif_4 } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";
import { DomainMove } from "@/components/domain-move";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"] });
const reading = Source_Serif_4({ variable: "--font-reading", subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"] });
// Script-specific reading fonts: not preloaded, the browser fetches them only when that language is on screen.
const greek = Noto_Serif({ variable: "--font-greek", subsets: ["greek", "greek-ext"], preload: false });
const hebrew = Noto_Serif_Hebrew({ variable: "--font-hebrew", subsets: ["hebrew"], preload: false });
const arabic = Noto_Naskh_Arabic({ variable: "--font-arabic", subsets: ["arabic"], preload: false });

export const metadata: Metadata = {
  metadataBase: new URL("https://versesacross.com"),
  title: { default: "VersesAcross", template: "%s · VersesAcross" },
  description: "Study the world's scriptures side by side, in many languages.",
  applicationName: "VersesAcross",
  // Link previews (texts, chats, social): the image comes from app/opengraph-image.png.
  openGraph: {
    type: "website",
    siteName: "VersesAcross",
    title: "VersesAcross",
    description: "Study the world's scriptures side by side, in many languages: 17 Bibles in 11 languages, listen along, free.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "VersesAcross",
    description: "Study the world's scriptures side by side, in many languages.",
  },
  appleWebApp: { title: "VersesAcross", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#15130f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${reading.variable} ${greek.variable} ${hebrew.variable} ${arabic.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="overflow-hidden">
        <DomainMove />
        {children}
      </body>
    </html>
  );
}

/**
 * Link-preview images (Facebook, texts, chats, Google Discover): one 1200×630 PNG per book, made at build
 * time into public/og/<work>/<book>.png (git-ignored). Chapter pages point their og:image at their book's
 * image (src/lib/seo.ts). Static files keep the Worker small: no image rendering on the server.
 *
 * Runs in `npm run pack` (prebuild). Skips work when the catalog hasn't changed since the last run.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { booksOfWork, catalog } from "../src/lib/catalog";
import { seoVersions } from "../src/lib/seo-shared";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "og");
const STAMP = path.join(OUT, ".stamp");

const INK = "#1f1d1a";
const MUTED = "#5f5a52";
const ACCENT = "#b45309";
const BG = "#fbfaf7";

async function main() {
  const script = await readFile(__filename, "utf8");
  const stamp = createHash("sha1").update(JSON.stringify(catalog)).update(script).digest("hex");
  if (existsSync(STAMP) && (await readFile(STAMP, "utf8")) === stamp) return console.log("og: up to date");
  await rm(OUT, { recursive: true, force: true });
  const icon = `data:image/png;base64,${(await readFile(path.join(ROOT, "public", "icon-192.png"))).toString("base64")}`;

  let n = 0;
  const t0 = Date.now();
  for (const work of catalog.works) {
    const books = booksOfWork(work.id);
    if (!books.length) continue;
    await mkdir(path.join(OUT, work.id), { recursive: true });
    const versions = seoVersions(work.id).map((v) => v.abbr);
    for (const b of books) {
      const name = b.name.length > 70 ? `${b.name.slice(0, 69)}…` : b.name;
      const size = name.length > 40 ? 64 : name.length > 22 ? 78 : name.length > 14 ? 92 : 104;
      const img = new ImageResponse(
        (
          <div style={{ display: "flex", width: "100%", height: "100%", background: BG, fontFamily: "Geist" }}>
            <div style={{ width: 18, height: "100%", background: ACCENT }} />
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "64px 72px" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 30, letterSpacing: 3, color: ACCENT, textTransform: "uppercase" }}>
                  {`${b.religion.name} · ${b.collection.name}`}
                </div>
                <div style={{ fontSize: size, color: INK, marginTop: 28, lineHeight: 1.05 }}>{name}</div>
                <div style={{ fontSize: 36, color: MUTED, marginTop: 30 }}>
                  {versions.length > 1 ? `Side by side: ${versions.join(" · ")}` : "Free to read, verse by verse"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={icon} width={72} height={72} style={{ borderRadius: 16 }} alt="" />
                <div style={{ display: "flex", flexDirection: "column", marginLeft: 22 }}>
                  <div style={{ fontSize: 38, color: INK }}>Verses Across</div>
                  <div style={{ fontSize: 26, color: MUTED }}>versesacross.com · free, no ads</div>
                </div>
              </div>
            </div>
          </div>
        ),
        { width: 1200, height: 630 },
      );
      await writeFile(path.join(OUT, work.id, `${b.id}.png`), Buffer.from(await img.arrayBuffer()));
      n++;
    }
  }
  await writeFile(STAMP, stamp);
  console.log(`og: ${n} images in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

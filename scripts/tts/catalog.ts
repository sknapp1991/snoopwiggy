/**
 * List generated recordings (.cache-audio/<version>/<voice>/<book>/<chapter>.mp3) in .cache-audio/index.json,
 * and (with --local) copy everything to public/audio so `next dev` / `next start` can play it.
 * In production the same folder (files + index.json) is uploaded to Cloudflare R2 and
 * NEXT_PUBLIC_AUDIO_BASE points there.
 *
 *   npx tsx scripts/tts/catalog.ts --local
 */
import { cp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { booksOfWork, getVersion } from "../../src/lib/catalog";
type Recording = { id: string; version: string; voice: string; label: string; engine: string; license: string; chapters?: Record<string, number[]> };

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, ".cache-audio");
const LOCAL = path.join(ROOT, "public", "audio");

/** Kokoro voice ids → readable labels. */
const VOICES: Record<string, string> = {
  af_heart: "Heart · US English (female)",
  af_bella: "Bella · US English (female)",
  af_nicole: "Nicole · US English (female, soft)",
  af_sarah: "Sarah · US English (female)",
  am_michael: "Michael · US English (male)",
  am_fenrir: "Fenrir · US English (male)",
  am_puck: "Puck · US English (male)",
  bf_emma: "Emma · British English (female)",
  bm_george: "George · British English (male)",
  bm_fable: "Fable · British English (male)",
  ef_dora: "Dora · Spanish (female)",
  em_alex: "Alex · Spanish (male)",
  ff_siwis: "Siwis · French (female)",
  if_sara: "Sara · Italian (female)",
  im_nicola: "Nicola · Italian (male)",
  pf_dora: "Dora · Brazilian Portuguese (female)",
  pm_alex: "Alex · Brazilian Portuguese (male)",
  rapunzelina: "Rapunzelina · Greek (female)",
  armenta: "Michael Armenta · human reader (LibriVox)",
};
/** Human recordings (not generated): public-domain readings, cut into chapters by scripts/tts/align-librivox.py. */
const HUMAN: Record<string, string> = {
  armenta: "Read by Michael Armenta for LibriVox (2001), public domain",
};
/** Voices made with Piper instead of Kokoro (licence noted per voice). */
const PIPER: Record<string, string> = {
  rapunzelina: "Generated with Piper (GPL-3.0 tool), voice el_GR-rapunzelina trained from scratch on a CC0 dataset",
};

const dirs = async (p: string) => (await readdir(p, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name);

async function main() {
  const local = process.argv.includes("--local");
  const recs: Recording[] = [];
  for (const version of await dirs(SRC)) {
    if (version === "hf" || version === "piper" || version.startsWith("librivox")) continue; // tools / raw downloads, not recordings
    for (const voice of await dirs(path.join(SRC, version))) {
      const chapters: Record<string, number[]> = {};
      let total = 0;
      let all = true;
      for (const b of booksOfWork(getVersion(version)?.work ?? "bible")) {
        const files = (await readdir(path.join(SRC, version, voice, b.id)).catch(() => [] as string[])).filter((f) => f.endsWith(".mp3"));
        const nums = files.map((f) => parseInt(f, 10)).sort((x, y) => x - y);
        if (nums.length) chapters[b.id] = nums;
        if (nums.length !== b.chapters) all = false;
        total += nums.length;
      }
      if (!total) continue;
      recs.push({
        id: `${version}/${voice}`,
        version,
        voice,
        label: VOICES[voice] ?? voice,
        engine: HUMAN[voice] ? "Human" : PIPER[voice] ? "Piper" : "Kokoro-82M",
        license: HUMAN[voice] ?? PIPER[voice] ?? "Generated with Kokoro-82M (Apache-2.0)",
        ...(all ? {} : { chapters }),
      });
      console.log(`  ${version}/${voice}: ${total} chapters${all ? " (complete)" : ""}`);
    }
  }
  // Best-sounding voices first (Kokoro's own quality grades), then the rest.
  const order = ["armenta", ...Object.keys(VOICES)]; // a human reader first
  recs.sort((a, b) => a.version.localeCompare(b.version) || (order.indexOf(a.voice) + 1 || 99) - (order.indexOf(b.voice) + 1 || 99));
  const index = JSON.stringify({ generatedAt: new Date().toISOString(), recordings: recs });
  await writeFile(path.join(SRC, "index.json"), index);
  if (local) {
    await rm(LOCAL, { recursive: true, force: true });
    for (const r of recs) await cp(path.join(SRC, r.version, r.voice), path.join(LOCAL, r.version, r.voice), { recursive: true });
    await writeFile(path.join(LOCAL, "index.json"), index);
    console.log("copied to public/audio");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

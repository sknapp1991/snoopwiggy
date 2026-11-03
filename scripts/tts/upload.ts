/**
 * Upload generated recordings (.cache-audio/<version>/<voice>/...) and index.json to the R2 bucket
 * that the site reads through /api/audio. Uses wrangler (already logged in), several uploads at once,
 * and remembers what was sent (.cache-audio/uploaded.json) so re-running only sends new chapters.
 *
 *   npx tsx scripts/tts/upload.ts            # everything new
 *   npx tsx scripts/tts/upload.ts --dry-run
 */
import { spawn } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, ".cache-audio");
const BUCKET = "snoopwiggy-audio";
const DONE = path.join(SRC, "uploaded.json");
const PARALLEL = 8;

async function walk(dir: string, out: string[] = []) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) await walk(p, out);
    else if (/\.(mp3|json)$/.test(d.name)) out.push(p);
  }
  return out;
}

function put(key: string, file: string, type: string, cache: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(
      "npx",
      ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", type, "--cache-control", cache, "--remote"],
      { cwd: ROOT, shell: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      if (code !== 0) console.error(`  failed ${key}: ${err.split("\n").find((l) => l.includes("ERROR")) ?? code}`);
      resolve(code === 0);
    });
  });
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const done: Record<string, number> = JSON.parse(await readFile(DONE, "utf8").catch(() => "{}"));
  const files: string[] = [];
  for (const v of await readdir(SRC, { withFileTypes: true }))
    if (v.isDirectory() && !["hf", "piper"].includes(v.name)) await walk(path.join(SRC, v.name), files);
  const todo: { key: string; file: string; mtime: number }[] = [];
  for (const f of files) {
    const key = path.relative(SRC, f).split(path.sep).join("/");
    const mtime = (await stat(f)).mtimeMs;
    if (done[key] !== mtime) todo.push({ key, file: f, mtime });
  }
  console.log(`${todo.length} files to upload (${files.length - todo.length} already there)`);
  if (dry) return;
  let i = 0;
  let ok = 0;
  const worker = async () => {
    while (i < todo.length) {
      const t = todo[i++];
      const mp3 = t.key.endsWith(".mp3");
      if (await put(t.key, t.file, mp3 ? "audio/mpeg" : "application/json", "public, max-age=31536000, immutable")) {
        done[t.key] = t.mtime;
        ok++;
        if (ok % 50 === 0) {
          console.log(`  ${ok}/${todo.length}`);
          await writeFile(DONE, JSON.stringify(done));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  await writeFile(DONE, JSON.stringify(done));
  // The list of recordings goes last, so the site only lists chapters whose files are uploaded.
  const index = path.join(SRC, "index.json");
  if (await stat(index).catch(() => null)) await put("index.json", index, "application/json", "public, max-age=300");
  console.log(`uploaded ${ok} files`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

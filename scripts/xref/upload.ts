/**
 * Upload the cross references (.cache-xref/<work>/<book>.json, from scripts/xref/build.py) to R2 as
 * xref/<work>/<book>.json, read by /api/xref. Only files that changed since the last upload are sent.
 *
 *   npx tsx scripts/xref/upload.ts
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, ".cache-xref");
const BUCKET = "snoopwiggy-audio";
const DONE = path.join(SRC, ".uploaded.json");
const PARALLEL = 8;

function put(key: string, file: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(
      "npx",
      ["wrangler", "r2", "object", "put", `"${BUCKET}/${key}"`, "--file", `"${file}"`, "--content-type", "application/json", "--remote"],
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
  const done: Record<string, string> = JSON.parse(await readFile(DONE, "utf8").catch(() => "{}"));
  const todo: { key: string; file: string; hash: string }[] = [];
  for (const w of await readdir(SRC, { withFileTypes: true })) {
    if (!w.isDirectory()) continue;
    for (const f of await readdir(path.join(SRC, w.name))) {
      const file = path.join(SRC, w.name, f);
      const hash = createHash("sha1").update(await readFile(file)).digest("hex");
      const key = `xref/${w.name}/${f}`;
      if (done[key] !== hash) todo.push({ key, file, hash });
    }
  }
  console.log(`${todo.length} files to upload`);
  let i = 0;
  let ok = 0;
  const worker = async () => {
    while (i < todo.length) {
      const t = todo[i++];
      if (await put(t.key, t.file)) {
        done[t.key] = t.hash;
        ok++;
        if (ok % 25 === 0) {
          console.log(`  ${ok}/${todo.length}`);
          await writeFile(DONE, JSON.stringify(done));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  await writeFile(DONE, JSON.stringify(done));
  console.log(`uploaded ${ok}/${todo.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

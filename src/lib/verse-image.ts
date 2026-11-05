"use client";
/**
 * A shareable picture of a verse: the reference, the verse in each version being read (with its
 * colour), and versesacross.com — drawn on a canvas (1080 px wide, square-ish, good for social posts
 * and messages). Shared through the phone's share sheet when it accepts images, else downloaded.
 */
export type ImageVerse = { abbr: string; language: string; text: string; dir: "ltr" | "rtl"; lang: string; color?: string };

const W = 1080;
const PAD = 84;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  // Languages without spaces between words (none in the library yet) would still wrap by character.
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderVerseImage(opts: { heading: string; reference: string; verses: ImageVerse[]; dark?: boolean }): Promise<Blob> {
  const dark = opts.dark ?? false;
  const bg = dark ? "#16181d" : "#fbfaf7";
  const ink = dark ? "#ece9e2" : "#1d232c";
  const muted = dark ? "#9aa1ab" : "#6b7280";
  const accent = "#b8935f";
  const serif = 'Georgia, "Times New Roman", "Noto Serif", "Noto Serif Devanagari", "Noto Naskh Arabic", serif';
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // Measure first (font size shrinks for long verses / many versions) so the canvas fits the text.
  const measure = document.createElement("canvas").getContext("2d")!;
  const total = opts.verses.reduce((n, v) => n + v.text.length, 0);
  const size = total > 900 ? 30 : total > 500 ? 36 : total > 250 ? 42 : 50;
  measure.font = `${size}px ${serif}`;
  const blocks = opts.verses.map((v) => wrap(measure, v.text, W - PAD * 2));
  const lineH = Math.round(size * 1.42);
  const labelH = opts.verses.length > 1 ? 40 : 0;
  const bodyH = blocks.reduce((h, b) => h + labelH + b.length * lineH + 40, 0);
  // Tall rather than cut off: long passages (a sutta paragraph in two languages) can need more than a square.
  const H = Math.max(W, 250 + bodyH + 140);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 14);

  // Heading: "CHRISTIANITY · NEW TESTAMENT", then the reference.
  ctx.fillStyle = muted;
  ctx.font = `600 26px ${sans}`;
  ctx.fillText(opts.heading.toUpperCase(), PAD, 108);
  ctx.fillStyle = ink;
  ctx.font = `700 58px ${serif}`;
  ctx.fillText(opts.reference, PAD, 182);

  let y = 182 + 70;
  const bodyTop = y;
  const bodyRoom = H - 140 - bodyTop;
  // Centre the verses vertically in the space left.
  y += Math.max(0, (bodyRoom - bodyH) / 2);
  opts.verses.forEach((v, i) => {
    if (labelH) {
      ctx.font = `600 26px ${sans}`;
      ctx.fillStyle = v.color ?? accent;
      ctx.textAlign = "left";
      ctx.direction = "ltr";
      ctx.fillText(`${v.abbr} · ${v.language}`, PAD, y + 26);
      y += labelH;
    }
    ctx.font = `${size}px ${serif}`;
    ctx.fillStyle = opts.verses.length > 1 && v.color ? v.color : ink;
    const rtl = v.dir === "rtl";
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = rtl ? "right" : "left";
    for (const line of blocks[i]) {
      y += lineH;
      ctx.fillText(line, rtl ? W - PAD : PAD, y - lineH * 0.25);
    }
    y += 40;
  });

  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = `600 30px ${serif}`;
  ctx.fillText("Verses", PAD, H - 64);
  const vw = ctx.measureText("Verses ").width;
  ctx.fillStyle = "#5f8fc4";
  ctx.fillText("Across", PAD + vw, H - 64);
  ctx.fillStyle = muted;
  ctx.font = `400 26px ${sans}`;
  ctx.textAlign = "right";
  ctx.fillText("versesacross.com", W - PAD, H - 64);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t draw the image"))), "image/png"));
}

/** Share the picture (phones) or download it (desktop / browsers that can't share files). */
export async function shareVerseImage(blob: Blob, name: string, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], `${name}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}

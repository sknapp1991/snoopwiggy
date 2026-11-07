"use client";
/** A QR code drawn as SVG (dark squares on white, so phone cameras read it in dark mode too). */
import qrcode from "qrcode-generator";
import { useMemo } from "react";

export function Qr({ text, size = 168, label }: { text: string; size?: number; label: string }) {
  const { n, path } = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    const count = q.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { n: count + 4, path: d };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" className="rounded-lg">
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

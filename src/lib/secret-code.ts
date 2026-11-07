"use client";
/**
 * Codes for sync and study groups: 25 random letters/digits (about 125 bits), shown in groups of five.
 * From a code the device derives (a) a storage name the server sees and (b) an AES-GCM key it never sees.
 * Data is compressed, then encrypted, on the device.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U

export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(25));
  const s = [...bytes].map((b) => ALPHABET[b & 31]).join("");
  return s.match(/.{5}/g)!.join("-");
}

/** Tidy a typed or pasted code: case, spaces and look-alike letters don't matter. Null if not a code. */
export function normalizeCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V")
    .replace(/[^0-9A-Z]/g, "");
  if (s.length !== 25 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return s.match(/.{5}/g)!.join("-");
}

export type CodeKeys = { id: string; key: CryptoKey };

/** purpose separates sync codes from group codes, so the same letters never mean the same storage. */
export async function deriveKeys(code: string, purpose: "sync" | "group"): Promise<CodeKeys> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code.replace(/-/g, "")), "HKDF", false, ["deriveBits", "deriveKey"]);
  const salt = new TextEncoder().encode(`versesacross-${purpose}-v1`);
  const idBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("id") }, base, 256);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("key") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { id: hex(idBits), key };
}

export const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** JSON → gzip → AES-GCM; output = 12-byte IV + ciphertext. */
export async function seal(key: CryptoKey, value: unknown): Promise<Uint8Array> {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  const packed = typeof CompressionStream !== "undefined" ? await pipe(raw, new CompressionStream("gzip")) : raw;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, packed as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

export async function open<T>(key: CryptoKey, data: ArrayBuffer | Uint8Array): Promise<T> {
  const b = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data)); // own ArrayBuffer copy
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, key, b.slice(12)));
  // gzip starts with 1f 8b; older/uncompressed payloads start with "{"
  const raw = plain[0] === 0x1f && plain[1] === 0x8b ? await pipe(plain, new DecompressionStream("gzip")) : plain;
  return JSON.parse(new TextDecoder().decode(raw)) as T;
}

export const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

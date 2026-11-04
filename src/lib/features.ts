/** Feature flags. NEXT_PUBLIC_* values are inlined at build time. */
export const features = {
  /** "Ask in…" hand-off to Gemini / ChatGPT / Claude (Phase 3). */
  askInExternal: true,
} as const;

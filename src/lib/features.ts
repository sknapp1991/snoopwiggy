/** Feature flags. NEXT_PUBLIC_* values are inlined at build time. */
export const features = {
  /** Built-in Ask AI side panel — reserved for a future paid tier (Phase 3 builds it, off by default). */
  askAiPanel: process.env.NEXT_PUBLIC_FEATURE_ASK_AI_PANEL === "true",
  /** "Ask in…" hand-off to Gemini / ChatGPT / Claude (Phase 3). */
  askInExternal: true,
} as const;

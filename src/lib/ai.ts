/**
 * Server-only AI provider abstraction. Phase 1: interface + stubs only (no network calls).
 * Phase 2 implements chapter translation; selected by AI_PROVIDER (default "gemini").
 * API keys are read from process.env on the server and never reach the browser.
 */
export type TranslateChapterInput = {
  reference: string; // e.g. "John 3"
  targetLanguage: string; // e.g. "es"
  verses: { v: string; t: string }[];
};
export type TranslateChapterOutput = { v: string; t: string }[];

export interface AIProvider {
  readonly name: string;
  translateChapter(input: TranslateChapterInput): Promise<TranslateChapterOutput>;
}

class NotImplementedProvider implements AIProvider {
  constructor(readonly name: string) {}
  async translateChapter(): Promise<TranslateChapterOutput> {
    throw new Error(`AI provider "${this.name}" is not implemented yet (Phase 2)`);
  }
}

export function getAIProvider(): AIProvider {
  const name = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  switch (name) {
    case "gemini": // GEMINI_API_KEY — free tier during development
    case "anthropic": // ANTHROPIC_API_KEY
      return new NotImplementedProvider(name);
    default:
      throw new Error(`Unknown AI_PROVIDER "${name}"`);
  }
}

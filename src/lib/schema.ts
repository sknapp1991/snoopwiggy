import { z } from "zod";

/** Lowercase slug used for work/version/book ids (safe for URLs and file paths). */
export const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

export const versionSchema = z.object({
  id: idSchema,
  work: idSchema,
  abbr: z.string().min(1),
  name: z.string().min(1),
  /** BCP-47-ish language code, see src/lib/languages.ts */
  language: z.string().min(2),
  /** "native" = a published translation; "ai" = machine translation (Phase 2). */
  kind: z.enum(["native", "ai"]),
  dir: z.enum(["ltr", "rtl"]),
  year: z.number().int(),
  yearNote: z.string().optional(),
  translator: z.string().min(1),
  license: z.string().min(1),
  licenseNote: z.string().optional(),
  attribution: z.string().optional(),
  sourceUrl: z.url(),
  /** true = copyrighted text used under a commercial licence (none yet). */
  licensed: z.boolean(),
  versification: z.string().min(1),
  import: z
    .object({
      provider: z.literal("ebible"),
      id: z.string().min(1),
      stripBrackets: z.boolean().optional(),
    })
    .optional(),
});

export const itemSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  work: idSchema.optional(),
  chapters: z.number().int().positive().optional(),
  status: z.enum(["available", "coming-soon"]).optional(),
});

export const collectionSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  items: z.array(itemSchema),
});

export const religionSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  collections: z.array(collectionSchema),
});

export const catalogSchema = z.object({
  $comment: z.string().optional(),
  works: z.array(z.object({ id: idSchema, name: z.string(), versification: z.string() })),
  versions: z.array(versionSchema),
  religions: z.array(religionSchema),
});

export const verseSchema = z
  .object({
    /** Canonical verse id (in the work's versification). String so split verses ("3a") are possible. */
    v: z.string().regex(/^\d+[a-z]?$/),
    /** Verse text. Empty only for continuation slots (see `cont`). */
    t: z.string(),
    /** This cell also covers canonical verses up to here: "26" (same chapter) or "40:5". */
    to: z.string().regex(/^(\d+:)?\d+[a-z]?$/).optional(),
    /** The version's own verse label when it differs from the canonical one, e.g. "13:1" or "10:25–26". */
    n: z.string().optional(),
    /** Continuation slot: this canonical verse's text is inside the cell at this "c:v". */
    cont: z.string().regex(/^\d+:\d+[a-z]?$/).optional(),
  })
  .refine((x) => (x.cont ? x.t === "" : x.t.length > 0), { message: "text required unless cont" });

export const chapterSchema = z.object({
  work: idSchema,
  version: idSchema,
  book: idSchema,
  chapter: z.number().int().positive(),
  verses: z.array(verseSchema).min(1),
});

export type Version = z.infer<typeof versionSchema>;
export type CatalogItem = z.infer<typeof itemSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type Religion = z.infer<typeof religionSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Verse = z.infer<typeof verseSchema>;
export type Chapter = z.infer<typeof chapterSchema>;

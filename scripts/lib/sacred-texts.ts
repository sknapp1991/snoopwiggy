/**
 * Shared clean-up for pages from the Internet Sacred Text Archive (sacred-texts.com).
 */

const MARKS: Record<string, string> = { acute: "́", grave: "̀", circ: "̂", uml: "̈", tilde: "̃", cedil: "̧", ring: "̊" };
const NAMED: Record<string, string> = {
  laquo: "«",
  raquo: "»",
  sect: "§",
  times: "×",
  acute: "'", // Griffith writes s´ for ś; the rest of his text uses s'
  middot: "·",
  para: "¶",
  deg: "°",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  hellip: "…",
  szlig: "ß",
  oelig: "œ",
  OElig: "Œ",
  AElig: "Æ",
  aelig: "æ",
  thorn: "þ",
  eth: "ð",
  oslash: "ø",
  Oslash: "Ø",
};

/** Any named HTML entity the importers' own tables miss: "&euml;" → "ë", "&Ecirc;" → "Ê", "&laquo;" → "«". */
export function namedEntity(name: string): string | undefined {
  if (NAMED[name]) return NAMED[name];
  const m = /^([A-Za-z])(acute|grave|circ|uml|tilde|cedil|ring)$/.exec(name);
  return m ? (m[1] + MARKS[m[2]]).normalize("NFC") : undefined;
}

/**
 * The page footer ("Sacred Texts | Hinduism « Previous: … Index Next: … »") and the script after it,
 * which otherwise end up in the last verse of a book.
 */
export const SITE_FOOTER = /(?:Sacred Texts\s*\|[^«]{0,80})?«\s*Previous:[\s\S]*$/;

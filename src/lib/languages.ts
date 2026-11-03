/** Base + comparison languages. `phase` marks languages whose native texts arrive later. */
export type Language = {
  code: string;
  name: string;
  native: string;
  dir: "ltr" | "rtl";
};

export const BASE_LANGUAGE = "en";

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English", dir: "ltr" },
  { code: "es", name: "Spanish", native: "Español", dir: "ltr" },
  { code: "fr", name: "French", native: "Français", dir: "ltr" },
  { code: "it", name: "Italian", native: "Italiano", dir: "ltr" },
  { code: "pt", name: "Portuguese", native: "Português", dir: "ltr" },
  { code: "de", name: "German", native: "Deutsch", dir: "ltr" },
  { code: "ru", name: "Russian", native: "Русский", dir: "ltr" },
  { code: "la", name: "Latin", native: "Latina", dir: "ltr" },
  { code: "el", name: "Greek", native: "Ελληνικά", dir: "ltr" },
  { code: "ar", name: "Arabic", native: "العربية", dir: "rtl" },
  { code: "he", name: "Hebrew", native: "עברית", dir: "rtl" },
];

export function getLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? { code, name: code, native: code, dir: "ltr" };
}

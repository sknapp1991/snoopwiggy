# Text licences

Every text in GlobalStudy must be public domain or carry a licence that allows commercial use.
No non-commercial (CC-BY-NC) or copyrighted texts are included. Each version also lives in
`data/catalog.json` (name, year, translator, licence, source URL), and its attribution is shown
under the text in the reader.

| Version | Language | Year | Translator | Licence | Source | Verified |
|---|---|---|---|---|---|---|
| King James Version (KJV) | English | 1611 / 1769 standard text | Translators commissioned by King James I | Public domain outside the UK. **UK: Crown letters patent** (see note) | [eBible.org eng-kjv](https://ebible.org/Scriptures/details.php?id=eng-kjv) | 2026-11-03 |
| World English Bible (WEB) | English | 2020 stable text | eBible.org (Michael Paul Johnson, ed.) and volunteers | Public domain. “World English Bible” is a trademark of eBible.org, and the text must stay unaltered to use the name | [eBible.org engwebp](https://ebible.org/Scriptures/details.php?id=engwebp) | 2026-11-03 |
| Reina-Valera 1909 (RVR 1909) | Spanish | 1909 | Casiodoro de Reina (1569), rev. Cipriano de Valera (1602), 1909 revision | Public domain | [eBible.org spaRV1909](https://ebible.org/Scriptures/details.php?id=spaRV1909) | 2026-11-03 |

## Notes and flags

- **KJV in the United Kingdom:** eBible.org states that letters patent give Cambridge University
  Press, Oxford University Press and Collins exclusive rights to *print* the KJV in the UK, and that the
  restriction has no effect outside the UK. Get legal advice before a commercial UK launch.
- **Formatting changes (no wording changes):** square brackets that KJV and RVR 1909 use to mark
  supplied words (italics in print) are removed, and whitespace is normalised.
- **Versification:** eBible's RVR 1909 places some verses at different numbers than the KJV (Hebrew-style
  chapter breaks, and verses merged into the last verse of a chapter). `data/versification/rvr1909.json`
  maps it onto the KJV grid so versions line up. Where RVR differs, the reader shows RVR's own verse number.
  The mapping was proposed by `scripts/suggest-versification.ts` and reviewed by hand.

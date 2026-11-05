# Text licences

Every text in Verses Across is public domain or carries a licence that allows commercial use. Nothing
non-commercial (CC-BY-NC) or copyrighted is included. Each version also lives in `data/catalog.json`
(name, year, translator, licence, source URL), and its attribution is shown under the text in the reader.
Licences were checked on the eBible.org details page and catalog on 2026-11-03.

| Version | Language | Year | Translator / text | Licence | Source |
|---|---|---|---|---|---|
| King James Version (KJV) | English | 1611 / 1769 | Translators commissioned by King James I | Public domain outside the UK (see note) | [eng-kjv](https://ebible.org/Scriptures/details.php?id=eng-kjv) |
| World English Bible (WEB) | English | 2020 | eBible.org (M. P. Johnson, ed.) | Public domain; name is a trademark (text unaltered) | [engwebp](https://ebible.org/Scriptures/details.php?id=engwebp) |
| American Standard Version (ASV) | English | 1901 | American Revision Committee | Public domain | [eng-asv](https://ebible.org/Scriptures/details.php?id=eng-asv) |
| Young's Literal Translation (YLT) | English | 1898 | Robert Young | Public domain | [engylt](https://ebible.org/Scriptures/details.php?id=engylt) |
| Bible in Basic English (BBE) | English | 1965 | S. H. Hooke (ed.) | Public domain in the US (see note) | [engBBE](https://ebible.org/Scriptures/details.php?id=engBBE) |
| Reina-Valera 1909 | Spanish | 1909 | C. de Reina, rev. C. de Valera | Public domain | [spaRV1909](https://ebible.org/Scriptures/details.php?id=spaRV1909) |
| Louis Segond 1910 | French | 1910 | Louis Segond | Public domain | [fraLSG](https://ebible.org/Scriptures/details.php?id=fraLSG) |
| Riveduta (Luzzi) | Italian | 1927 | Giovanni Luzzi | Public domain | [ita1927](https://ebible.org/Scriptures/details.php?id=ita1927) |
| Diodati | Italian | 1885 | Giovanni Diodati | Public domain | [ita1885](https://ebible.org/Scriptures/details.php?id=ita1885) |
| Bíblia Livre (BLIVRE) | Portuguese | 2018 | D. Santos, M. Sérgio, M. Teles, after Almeida 1819 | **CC BY 4.0**: credit required (shown in the app) | [porbr2018](https://ebible.org/Scriptures/details.php?id=porbr2018) |
| Lutherbibel 1912 | German | 1912 | Martin Luther (1912 rev.) | Public domain | [deu1912](https://ebible.org/Scriptures/details.php?id=deu1912) |
| Elberfelder (unrevidiert) | German | 1905 | J. N. Darby, C. Brockhaus et al. | Public domain | [deuelo](https://ebible.org/Scriptures/details.php?id=deuelo) |
| Synodal | Russian | 1876 | Russian Holy Synod | Public domain | [russyn](https://ebible.org/Scriptures/details.php?id=russyn) |
| Vulgata Clementina | Latin | 1598 | Jerome; Clementine edition | Public domain | [latVUC](https://ebible.org/Scriptures/details.php?id=latVUC) |
| Septuagint + Textus Receptus | Greek | 1851 / — | Brenton's LXX edition (OT); Textus Receptus (NT) | Public domain | [grcbrent](https://ebible.org/Scriptures/details.php?id=grcbrent), [grctr](https://ebible.org/Scriptures/details.php?id=grctr) |
| Van Dyck | Arabic | 1865 | Eli Smith, Cornelius Van Dyck | Public domain | [arb-vd](https://ebible.org/Scriptures/details.php?id=arb-vd) |
| WLC + Salkinson–Ginsburg | Hebrew | — / 1886 | Westminster Leningrad Codex (OT); Salkinson & Ginsburg (NT) | Public domain | [hebwlc](https://ebible.org/Scriptures/details.php?id=hebwlc), [hebsg](https://ebible.org/Scriptures/details.php?id=hebsg) |

## Notes and flags

- **KJV in the United Kingdom:** letters patent give Cambridge University Press, Oxford University Press
  and Collins exclusive rights to *print* the KJV in the UK. eBible.org states the restriction has no
  effect outside the UK. Get legal advice before any commercial UK launch.
- **BBE:** public domain in the US because it was published there without a copyright notice. Its status
  elsewhere is less clear. Low risk for a free site; confirm before any commercial use outside the US.
- **Formatting only, no wording changes:** square brackets used to mark supplied words are removed, and
  whitespace is normalised.
- **Versification:** every version is aligned to the KJV verse grid so columns line up. The reviewed maps
  are in `data/versification/<version>.json`, proposed by `scripts/suggest-versification.ts` (length
  alignment with verse-number evidence). Where a version numbers a verse differently, its own number is
  shown next to the text. Verses with no KJV counterpart appear as extra rows (e.g. "3a"). Whole extra
  chapters (Psalm 151, the Greek and Latin additions to Esther and Daniel) are set aside for the
  Apocrypha & Deuterocanon section.
- **Septuagint sections not yet aligned:** Jeremiah 25–51, Proverbs 24–31, Exodus 35–40 and
  1 Kings 20–21 are ordered differently in the LXX. They are left out of the Greek column, with a note,
  until a reordering table is added (Phase 4).
- **Not included:** no public-domain Almeida (Portuguese) or Delitzsch Hebrew NT is available on
  eBible.org, so Bíblia Livre (CC BY 4.0) and Salkinson–Ginsburg are used instead.

## Apocrypha & Deuterocanon (added Nov 2026)

Tobit, Judith, Wisdom, Sirach, Baruch (with the Letter of Jeremiah as chapter 6 in the KJV and
Vulgate), 1–2 Maccabees, 1 Esdras, Susanna and Bel and the Dragon, plus 3–4 Maccabees (Greek only).
- **KJV** – the 1611 Apocrypha in eBible.org's KJV (eng-kjv), public domain (UK caveat above).
- **WEB** – Old and New Testaments unchanged (engwebp); the deuterocanonical books come from the
  World English Bible edition that includes them (eng-web), public domain.
- **Greek** – Septuagint (grcbrent), public domain. **Latin** – Clementine Vulgate, public domain.
- Books a version doesn't have show "This Bible doesn't include this book". Where traditions number
  verses differently (e.g. the Vulgate's Tobit and Sirach follow another text), verses show as gaps
  rather than being forced into line. The Greek additions to Esther, 1 Enoch (R.H. Charles 1917) and
  the Gospel of Thomas follow later.

## Tanakh (Judaism, added Nov 2026)

Torah, Nevi'im and Ketuvim in Jewish book order and Hebrew verse numbering (e.g. Malachi 3:19–24,
Joel 4, psalm titles as verse 1).
- **JPS 1917** – The Holy Scriptures according to the Masoretic Text, Jewish Publication Society of
  America, 1917; public domain in the US (published before 1931). Source: eBible.org (engjps). eBible
  stores it in English numbering with the Hebrew reference marked; `scripts/import-tanakh.ts` restores
  the Hebrew numbering from those markers.
- **MT** – Westminster Leningrad Codex (eBible.org hebwlc), public domain.
- The Ten Commandments (Exodus 20, Deuteronomy 5), Psalm 70 and Nehemiah 7 are divided into verses
  differently in the two editions; those verses show as gaps rather than being forced into line.

## Dhammapada (Buddhism, added Nov 2026)

26 chapters (vaggas), traditional verse numbers 1–423.
- **Sujato** – "Sayings of the Dhamma", translated by Bhikkhu Sujato; **Pāli** – Mahāsaṅgīti edition.
  Both from SuttaCentral's bilara-data, dedicated to the public domain (CC0):
  https://github.com/suttacentral/bilara-data (`scripts/import-dhammapada.ts`).

## Pali Canon / Tipiṭaka (Buddhism, added Nov 2026)

Sutta Pitaka (DN, MN, SN 1–56, AN 1–11, and the Khuddaka books Kp, Ud, Iti, Snp, Thag, Thig), Vinaya
Pitaka (Pātimokkhas, Vibhaṅgas, Khandhaka, Parivāra) and Abhidhamma Pitaka (7 books), from SuttaCentral's
bilara-data, all dedicated to the public domain (CC0) (`scripts/import-tipitaka.ts`):
- **English** – Bhikkhu Sujato (Sutta Pitaka) and Bhikkhu Brahmali (Vinaya Pitaka).
- **Pāli** – Mahāsaṅgīti Tipiṭaka edition (root text).
- **No English Abhidhamma**: every English translation (PTS and others) is still under copyright, so the
  Abhidhamma is shown in Pāli only, with a note saying why.

## The Quran (Islam, added Nov 2026)

114 surahs in the standard (Hafs) verse numbering.
- **Arabic** – Tanzil Quran Text (Uthmani), © Tanzil Project, CC BY 3.0, https://tanzil.net/ . Shown
  verbatim as the licence requires (search ignores vowel marks internally, but the text is never changed).
- **Pickthall** – "The Meaning of the Glorious Koran", Marmaduke Pickthall (Alfred A. Knopf, 1930);
  public domain in the US since 1 January 2026 (published 1930). Text from Wikisource's proofread
  transcription of the 1930 edition (79 surahs) and, for the rest, the Internet Archive scan's text layer
  (MN40248ucmf_9), cleaned of page headers and footnotes (`scripts/import-quran.ts`).
  Pickthall's 1930 numbering differs from the standard in places (e.g. Surah 6 has 166 verses); verses are
  matched to the standard numbering by content (lengths against the Arabic) and his own number is shown.
  A few verse numbers are unreadable in the scan: those verses show as a gap or as part of the previous
  verse until Wikisource's proofreading covers them (re-run the import to pick that up).
  Tanzil's translation files are non-commercial, so no text is taken from them.

## Yoga Sutras of Patanjali (Yoga, added Nov 2026)

- **Johnston** – "The Yoga Sutras of Patanjali: The Book of the Spiritual Man", translated by Charles
  Johnston (1912), public domain, Project Gutenberg #2526. Four books (Samadhi, Sadhana, Vibhuti,
  Kaivalya; 51 + 55 + 55 + 34 sutras). Only the sutras are included, not Johnston's commentary.
  A Sanskrit text will be added once a public-domain source is confirmed.

## Recorded audio (audio v2)

- **Kokoro-82M** (hexgrad, Apache-2.0 open weights; https://huggingface.co/hexgrad/Kokoro-82M) reads the
  public-domain texts above into chapter MP3s (`scripts/tts/generate.py`). The model card states it was
  trained on permissive / non-copyrighted audio. The recordings are derived from public-domain texts and
  an Apache-licensed model, and the reader shows "Generated with Kokoro-82M (Apache-2.0)".
- **French voice ff_siwis** was trained partly on the SIWIS corpus (CC BY 4.0). If French recordings are
  published, credit: "SIWIS French Speech Synthesis Database (CC BY 4.0)".
- The model's helper libraries (misaki, spaCy en_core_web_sm, and espeak-ng for non-English languages)
  run only on the generating PC and are not shipped.

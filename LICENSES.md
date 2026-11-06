# Text licences

Every text in Verses Across is public domain or carries an open licence. Each version also lives in
`data/catalog.json` (name, year, translator, licence, source URL), which is the complete list, and its
attribution is shown under the text in the reader. The table below covers the Bibles. Licences were
checked on the eBible.org details page and catalog on 2026-11-03.

**One non-commercial text:** the William Davidson Talmud (English, via Sefaria) is **CC BY-NC**. That is
fine because Verses Across is free, with no ads and no purchases. If that ever changes, this text must
be removed or licensed first. Every other text allows commercial use.

These licences cover the texts only. The app's own code is under the AGPL (see `LICENSE` and `README.md`).

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

## Bhagavad Gita (Hinduism, added Nov 2026)

18 chapters, 700 verses (standard numbering). Both versions come from Wikisource's proofread
transcription of Annie Besant's translation, 4th edition (1922, public domain in the US), which prints
each verse in Sanskrit and English (`scripts/import-gita.ts`):
- **Besant** – English, Annie Besant. Her footnotes are not included.
- **Sanskrit** – the Devanagari text as printed in that edition.

## Hatha Yoga Pradipika (Yoga, added Nov 2026)

4 chapters; Pancham Sinh's translation (1914, public domain), from the Internet Sacred Text Archive's
transcription (`scripts/import-hyp.ts`). English only: the site's Sanskrit is an experimental
conversion its editor says doesn't line up with the book.

## 1 Enoch and the Gospel of Thomas (Christianity, added Nov 2026)

- **1 Enoch** – R. H. Charles' translation (1917, public domain), 108 chapters, from the Internet Sacred
  Text Archive (`scripts/import-enoch.ts`). His editorial brackets and footnotes are left out.
- **Gospel of Thomas** – Mark M. Mattison's translation from the Coptic, which he committed to the
  public domain (gospels.net/thomas), 114 sayings (`scripts/import-thomas.ts`).

## Mishnah (Judaism, added Nov 2026)

All six orders, 63 tractates, via Sefaria's API (`scripts/import-mishnah.ts`):
- **Kulp** – "Mishnah Yomit" English translation by Dr. Joshua Kulp, CC BY (credit shown with the text).
- **Hebrew** – Mishnah, ed. Romm, Vilna 1913, public domain. (Bikkurim chapter 4, a later addition,
  isn't in this edition; that chapter shows a note.)

## Talmud Bavli (Judaism, added Nov 2026)

The 37 tractates of the six orders via Sefaria's API (`scripts/import-talmud.ts`); chapter = folio (daf),
each segment labelled "2a:3":
- **Talmud** – Hebrew/Aramaic text, Wikisource edition, **CC BY-SA** (credit shown; shared under the
  same licence).
- **Cohen** – English for Berakhot only: A. Cohen, Cambridge University Press 1921, public domain.
- **Davidson** – English for all 37 tractates: the William Davidson digital edition of the Koren Noé
  Talmud (Rabbi Adin Even-Israel Steinsaltz), **CC BY-NC** via Sefaria — credit shown; allowed because
  Verses Across is non-commercial (free forever, no ads). The bold literal translation and the
  explanation woven into it are shown together as plain text.

## Hadith (Islam, added Nov 2026)

Nine collections in Arabic — Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud, Jami at-Tirmidhi,
Sunan an-Nasa'i, Sunan Ibn Majah, Muwatta Malik, and the Forty Hadith of an-Nawawi and Qudsi — from
the open hadith-api project (fawazahmed0, The Unlicense; the classical Arabic itself is public domain)
(`scripts/import-hadith.ts`). No English: the usual translations (Muhsin Khan, Siddiqui, …) are still
under copyright; every chapter says so.

## Upanishads (Hinduism, added Nov 2026)

Twelve Upanishads (Isha, Kena, Katha, Prashna, Mundaka, Taittiriya, Aitareya Aranyaka, Chandogya,
Brihadaranyaka, Svetasvatara, Kaushitaki, Maitrayaniya) in F. Max Müller's translation, Sacred Books of
the East vols. 1 (1879) and 15 (1884), public domain, from the Internet Sacred Text Archive
(`scripts/import-upanishads.ts`). Footnotes are left out. (Müller didn't translate the Mandukya.)

## Ramayana (Hinduism, added Nov 2026)

Ralph T. H. Griffith's verse translation, "The Rámáyan of Válmíki" (1870–74, public domain), six books,
from the Internet Sacred Text Archive (`scripts/import-ramayana.ts`). Griffith doesn't number stanzas:
verses are his stanzas in order (long ones split at a sentence end). Footnotes are left out.

## Vedas (Hinduism, added Nov 2026)

Ralph T. H. Griffith's translations (public domain), from the Internet Sacred Text Archive
(`scripts/import-vedas.ts`): Rig Veda (1896, 10 books, hymn = chapter), Sama Veda (1895), White Yajur
Veda / Vajasaneyi Samhita (1899, 40 books), Atharva Veda (1895–96, 20 books). English only: the site's
Sanskrit is a machine conversion with errors.

## Mahabharata (Hinduism, added Nov 2026)

Kisari Mohan Ganguli's prose translation (1883–96, public domain), all 18 books, from the Internet Sacred
Text Archive (`scripts/import-mahabharata.ts`). Chapter = Ganguli's section; verse = paragraph.
Footnotes are left out.

## World religions (added Nov 2026, `scripts/import-world.ts`)

Sacred-texts.com now turns automated downloads away, so these come from Project Gutenberg files.

- **Tao Te Ching** — James Legge (1891, public domain), Gutenberg #216, with Legge's verse numbers; the
  Chinese text (public domain) from Gutenberg #24039, one block per chapter beside Legge's verses.
- **Analects of Confucius** — James Legge (1893, public domain) with the Chinese of his edition,
  Gutenberg #4094. Chapter = Legge's "Book", verse = his numbered chapters. A few misprinted chapter
  numbers in the source are put back in sequence.
- **Australian Legendary Tales** — K. Langloh Parker (1896, public domain), Gutenberg #3833; tale =
  chapter, paragraph = verse. Collected by a settler; the reader notes that the framing is hers.
- **The Hidden Words** and **The Kitáb-i-Aqdas** (Bahá'í Faith) — © Bahá'í International Community,
  used under the Bahá'í Reference Library terms (free to copy for non-commercial use, unaltered, with the
  copyright notice and source attached); text via Gutenberg #16941 and #16523. Allowed here because the
  site is free with no ads; the notice is shown with the text.

- **Sri Guru Granth Sahib** (Sikhism) — Gurmukhi (public domain) and Dr. Sant Singh Khalsa's English,
  from Open Granth's corpus, which takes both from the Shabad OS database. Khalsa's translation has no
  formal licence but has been shared freely for decades; included on the owners' decision (Nov 2026) for
  this free, non-commercial site, with credit. Book = raag section, chapter = ang (titled "Ang N").
- **Philosophy & Secular Thought** — all public domain, from Project Gutenberg: Lucretius tr. Leonard
  (#785), Marcus Aurelius tr. Long (#15877), Epictetus tr. Higginson (#45109), Hume's *Dialogues* (#4583),
  Paine's *Age of Reason* (#3743).

- **Kojiki** (Shinto, Chamberlain 1882), **Jaina Sutras** (Jacobi, SBE 22 and 45: Akaranga, Kalpa,
  Uttaradhyayana, Sutrakritanga) and **Myths and Legends of China** (Werner 1922) — public domain,
  from sacred-texts' zipped text files (kj/sbe22/sbe45/mlc.txt.gz), downloaded by hand in a browser
  (the site turns scripts away) into data/raw. Footnotes and page numbers are left out.
- **Yoruba Legends** (M. I. Ogumefu, 1929, public domain) — from Global Grey's free EPUB edition.
- **Zhuangzi** (Herbert A. Giles, 1889; Gutenberg #59709, his notes left out), **Navaho Legends**
  (Washington Matthews, 1897; #60165) and **Myths and Legends of the Sioux** (Marie L. McLaughlin,
  1916; #341) — public domain.
- **The Gathas of Zarathustra** (Yasna 28–34, 43–51, 53; L. H. Mills, SBE 31, 1887, public domain) — read
  page by page from sacred-texts in a browser with the owner's go-ahead (Nov 2026; there is no zipped
  file); only the translation, without Mills' commentary or footnotes (data/raw/gathas).
- **Mencius** — the complete Chinese (Gutenberg #24178; two passages of Zhu Xi's commentary that slipped
  into that edition are removed), James Legge's English for Book I, Part I only (#10056, the only part on
  Gutenberg), and a complete **AI translation** from the Chinese made for this site (marked "AI translation"
  in the reader; free to share with credit).
- **The Great Learning** and **The Doctrine of the Mean** — the Chinese in Zhu Xi's arrangement (Wikisource,
  四書章句集註, his notes left out) and James Legge's English (The Chinese Classics vol. 1, 2nd ed. 1893,
  Wikisource transcription), all public domain.
- **Nihongi** — W. G. Aston's translation (1896, public domain), from the proofread Wikisource
  transcription; footnotes and marginal references left out, marginal years put at the start of paragraphs.
- **The Avesta beyond the Gathas** — James Darmesteter's Vendidad (Sacred Books of the East 4, 1880) and
  Yashts (SBE 23, 1883), and L. H. Mills' Yasna (SBE 31, 1887), all public domain; text from the proofread
  transcription in archive.org's "complete-SBE-avesta-three-volumes-in-one" (Public Domain Mark), checked
  against scans; footnotes left out. The Gathic chapters of the Yasna point to the Gathas.
- **Popol Vuh, full text** — Francisco Ximénez's Spanish (c. 1701–1703; ed. Scherzer, Vienna 1857, public
  domain; archive.org scans, OCR corrected, Scherzer's notes left out; chapters as in Brasseur de Bourbourg,
  1861) and an **AI translation** of it into English made for this site (marked "AI translation"; free to
  share with credit).
- **Popol Vuh** — Lewis Spence's 1908 retelling of its four books (#56550), public domain; not a full
  translation, and his commentary is left out.
- **Classics from Project Gutenberg** (`scripts/import-classics.ts`, all public domain), chapter = the
  book's own book/chapter/section, verse = paragraph, footnotes and back matter left out:
  Greek & Roman — Homer's Iliad and Odyssey (Samuel Butler), Hesiod and the Homeric Hymns
  (Evelyn-White), Virgil's Aeneid (Dryden), Ovid's Metamorphoses I–XV (Riley, two volumes: #21765, #26073). Philosophy — Plato's
  Republic, Apology, Symposium, Phaedo and Phaedrus (Jowett), Aristotle's Nicomachean Ethics (Chase), Seneca's Morals (L'Estrange), Montaigne's
  Essays (Cotton), Pascal's Pensées (Trotter), Descartes' Discourse on Method (Veitch), Spinoza's
  Ethics (Elwes), Emerson's Essays, Mill's On Liberty, Schopenhauer's Wisdom of Life (Saunders),
  Nietzsche's Zarathustra (Common) and Beyond Good and Evil (Zimmern), Russell's Problems of Philosophy;
  Hobbes' Leviathan, Locke's Second Treatise of Government, Rousseau's Social Contract (Cole);
  Kant's Groundwork and Critique of Practical Reason (Abbott), Critique of Pure Reason (Meiklejohn) and
  Perpetual Peace (M. Campbell Smith) — Kant's own footnotes are left out too.
  Christian classics — Augustine's Confessions (Pusey), Thomas à Kempis' Imitation of Christ (Benham).
  Psychology — William James' Varieties of Religious Experience, Freud's General Introduction to
  Psychoanalysis (Hall), Jung's Psychology of the Unconscious (Hinkle), Le Bon's The Crowd.
  Not included because they are still under copyright: Jung's Archetypes and the Collective
  Unconscious, Frankl's Man's Search for Meaning.
- **The Quran in Spanish** — Julio Cortés, from the Tanzil Project's translations, which allow
  non-commercial use with credit.

Not yet included (shown as "coming soon"): the rest of the Avesta (avesta.org forbids copying;
sacred-texts has no zipped file for SBE 4/23/31), the Great Learning and Doctrine of the Mean, the
Nihongi (only rough scans of Aston's 1896 translation), and English tafsir (permission asked of the
Royal Aal al-Bayt Institute by email on 2026-11-06).

## Recorded audio (audio v2)

- **Kokoro-82M** (hexgrad, Apache-2.0 open weights; https://huggingface.co/hexgrad/Kokoro-82M) reads the
  public-domain texts above into chapter MP3s (`scripts/tts/generate.py`). The model card states it was
  trained on permissive / non-copyrighted audio. The recordings are derived from public-domain texts and
  an Apache-licensed model, and the reader shows "Generated with Kokoro-82M (Apache-2.0)".
- **French voice ff_siwis** was trained partly on the SIWIS corpus (CC BY 4.0). If French recordings are
  published, credit: "SIWIS French Speech Synthesis Database (CC BY 4.0)".
- The model's helper libraries (misaki, spaCy en_core_web_sm, and espeak-ng for non-English languages)
  run only on the generating PC and are not shipped.

# Verses Across

Multi-religion scripture study: read texts side by side in many languages. See `BUILD_PLAN.md` for the full spec.
Phase 5 will expand this README.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run dev:lan    # also reachable from your phone on the same Wi-Fi: http://<your-PC-IP>:3000
```

## Scripture data

Texts are static JSON in `public/texts/<work>/<version>/<book>/<chapter>.json`, produced only by the import scripts.
Nobody edits them by hand, and AI never generates them.

```bash
npm run import:all   # download from eBible.org (cached in data/raw/) and convert
npm run validate     # schema, chapter counts, cross-version verse report
```

Adding a version:
1. Verify its licence.
2. Add it to `data/catalog.json` with an `import` block.
3. Run `npx tsx scripts/import-ebible.ts <id>`.
4. Run `npx tsx scripts/suggest-versification.ts kjv <id>` and review any mapping it proposes.
5. Add the version to `LICENSES.md`.

## Environment

Copy `.env.example` to `.env.local` (git-ignored). Phase 1 needs no keys. Phase 2 uses `GEMINI_API_KEY`.

## Who made it

Verses Across is made by **Skylar Knapp** and **Michael Knapp**. Skylar builds it. Michael tests every
feature in his own daily study, and most of what the app does came from his testing and requests.

## Copyright and license

Copyright © 2026 Skylar Knapp and Michael Knapp.

The **code** is free software under the [GNU Affero General Public License v3.0 or later](LICENSE). You may use,
change and share it, but any version you share or run for others (including as a website) must stay
open source under the same license.

The **scripture texts and recordings** are not ours and are not covered by this license. Each one is
public domain or carries its own licence, listed in `LICENSES.md` and `data/catalog.json`.

**Name and logo:** "Verses Across" and the Verses Across logo are not covered by the license. If you share
a modified version, please give it a different name and logo, so nobody mistakes it for this project.

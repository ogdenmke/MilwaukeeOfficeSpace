# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Commercial office space leasing website for Ogden & Company in Milwaukee. Static site deployed to GitHub Pages, with live data pulled from Google Sheets. Most visitors arrive by scanning a QR code on their phone, so mobile UX is the top priority.

## Architecture

**Data flow:** Google Sheets → CSV export API → `site/js/app.js` (fetched client-side on every page load)

- `site/js/config.js` — `SITE_CONFIG` object with all client-specific values (company name, brand color, Google Sheet ID, inquiry emails, GA ID, logo paths, storage prefix). Loaded before `app.js` in every HTML page.
- `site/index.html` — Home page: Leaflet map with numbered pins, building legend cards, "Browse All Suites" filter section, broker contacts
- `site/building.html` — Building detail page (loaded via `?id=BUILDING_ID`): building info, suite cards, document modal, share button
- `site/js/app.js` — All site logic in one file. Reads branding from `SITE_CONFIG`. Key sections:
  - `CONFIG` block at top (delegates to `SITE_CONFIG` for Sheet ID and display settings)
  - `parseCSV()` / `loadData()` — fetches and parses Google Sheets CSV
  - `initMap()` — Leaflet map with custom SVG pin markers, pin drop animations, click-to-scroll
  - `legendCard()` — builds legend cards with thumbnails, availability counts, "For Sale" badges
  - `initSuiteSearch()` — multi-select building dropdown, status filter, min/max SF inputs
  - `openDocModal()` — iframe modal for brochures/floor plans with fallback link for Google Drive
  - `addShareButton()` / `shareSuite()` — Web Share API with clipboard fallback
  - `initBackToTop()` — floating scroll-to-top button
- `site/css/style.css` — All styles in one file. Uses `--red` and `--red-dark` CSS variables for brand color. Mobile breakpoints at 768px and 480px.
- `site/data/` — Fallback JSON files (used when `GOOGLE_SHEET_ID` is blank)
- `setup.py` — Interactive rebranding script. Updates `config.js`, replaces company name/tagline/URL across all HTML files, and swaps CSS color variables.

**Google Sheet ID:** `1pnKTusIbZuhHyzjUn5lHtUoLHR6kNnybQPc-RrqPqBU`
The sheet has three tabs: **Buildings**, **Suites**, **Contacts**.

**External dependencies (CDN, no install needed):**
- Leaflet.js 1.9.4 (map library)
- CARTO Light tiles (map background)

## Build & Deploy

**No build step needed for normal updates** — edit the Google Sheet and the site updates automatically.

To regenerate local JSON fallback files from the Excel spreadsheet:
```bash
pip install openpyxl    # first time only
python3 build.py        # reads Ogden_Office_Listings.xlsx → site/data/*.json
```

To rebrand the site for a new client:
```bash
python3 setup.py        # interactive — prompts for company name, colors, Sheet ID, etc.
```

**Deployment:** Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) deploys the `site/` folder to GitHub Pages automatically.

**Live site:** https://caseyski.github.io/MKE-Office-Space/

## Local Development

Open `site/index.html` directly in a browser, or use any static server:
```bash
cd site && python3 -m http.server 8000
```
No Node.js, npm, or bundler required.

## Key Patterns

- **"For Sale" detection:** Buildings are identified as for-sale if `listing_type === "sale"`, or `asking_price` exists, or `building_name` contains "For Sale". These show a "For Sale" badge instead of suite availability counts.
- **Google Drive documents:** Embedded via iframe using `/file/d/ID/preview` URLs. Google blocks iframes on some mobile browsers, so the modal includes a "Having trouble? Open in new tab" fallback link.
- **Sharing:** Uses `navigator.share()` on mobile (native share sheet), falls back to `navigator.clipboard.writeText()` on desktop.
- **Pin animations:** CSS `@keyframes pinDrop` with staggered `animation-delay` (0.12s per pin).
- **Images:** Building photos and floor plans go in `site/images/`. The Google Sheet references them by filename. Google Drive file IDs can also be used for photos.

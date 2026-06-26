# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Commercial office space leasing website for Ogden & Company in Milwaukee. Static site deployed to GitHub Pages, with live data pulled from Google Sheets. Most visitors arrive by scanning a QR code on their phone, so mobile UX is the top priority.

This repo also includes a white-label `template/` that can be used to spin up the same site for a new client via `setup.py`.

## Directory Structure

- `site/` — **Ogden & Company production site.** Do not modify — deployed live to GitHub Pages.
- `template/` — White-label template with `__PLACEHOLDER__` tokens and `SITE_CONFIG`-driven JS. Used by `setup.py` to generate new client sites.
- `setup.py` — Interactive script that copies `template/` to a new directory and fills in all client-specific values.

## Architecture (site/)

The Ogden production site. **Do not modify these files.**

**Data flow:** Google Sheets → CSV export API → `site/js/app.js` (fetched client-side on every page load)

- `site/index.html` — Home page: Leaflet map with numbered pins, building legend cards, "Browse All Suites" filter section, broker contacts
- `site/building.html` — Building detail page (loaded via `?id=BUILDING_ID`): building info, suite cards, document modal, share button
- `site/js/app.js` — All site logic in one file. Key sections:
  - `CONFIG` block at top (Sheet ID, display settings)
  - `parseCSV()` / `loadData()` — fetches and parses Google Sheets CSV
  - `initMap()` — Leaflet map with custom SVG pin markers, pin drop animations, click-to-scroll
  - `legendCard()` — builds legend cards with thumbnails, availability counts, "For Sale" badges
  - `initSuiteSearch()` — multi-select building dropdown, status filter, min/max SF inputs
  - `openDocModal()` — iframe modal for brochures/floor plans with fallback link for Google Drive
  - `addShareButton()` / `shareSuite()` — Web Share API with clipboard fallback
  - `initBackToTop()` — floating scroll-to-top button
- `site/css/style.css` — All styles in one file. Mobile breakpoints at 768px and 480px.
- `site/data/` — Fallback JSON files (used when `GOOGLE_SHEET_ID` is blank)

**Google Sheet ID:** `1pnKTusIbZuhHyzjUn5lHtUoLHR6kNnybQPc-RrqPqBU`
The sheet has three tabs: **Buildings**, **Suites**, **Contacts**.

**External dependencies (CDN, no install needed):**
- Leaflet.js 1.9.4 (map library)
- CARTO Light tiles (map background)

## Architecture (template/)

The white-label template. All client-specific content uses placeholders or `SITE_CONFIG`.

- `template/js/config.js` — `SITE_CONFIG` object with all client-specific values (company name, brand color, Google Sheet ID, inquiry emails, GA ID, logo paths, storage prefix). Loaded before `app.js` in every HTML page.
- `template/js/app.js` — Same logic as `site/js/app.js` but reads all branding from `SITE_CONFIG` instead of hardcoded values.
- `template/*.html` — Use `__COMPANY_NAME__`, `__COMPANY_NAME_FULL__`, `__COMPANY_TAGLINE__`, `__SITE_URL__`, `__GA_ID__` placeholders that `setup.py` replaces.
- `template/css/style.css` — Uses `--red` and `--red-dark` CSS variables that `setup.py` swaps to the client's brand color.
- Logo files expected at `template/images/logos/logo-white.svg`, `logo-dark.svg`, `favicon.svg`, `favicon.png`.

## Build & Deploy

**No build step needed for normal Ogden site updates** — edit the Google Sheet and the site updates automatically.

To regenerate local JSON fallback files from the Excel spreadsheet:
```bash
pip install openpyxl    # first time only
python3 build.py        # reads Ogden_Office_Listings.xlsx → site/data/*.json
```

To set up a new client site from the template:
```bash
python3 setup.py                  # outputs to new-site/
python3 setup.py ./my-client      # outputs to ./my-client/
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

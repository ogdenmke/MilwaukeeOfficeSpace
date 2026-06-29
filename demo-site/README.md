# Office Space Template

White-label commercial office space leasing website. This template is used by `setup.py` to generate a branded site for a new client.

## Quick Start

From the repository root:

```bash
python3 setup.py ./my-client
```

The script will prompt for company name, brand color, Google Sheet ID, and other values, then output a ready-to-deploy site in the target directory.

## How It Works

### Placeholders in HTML

HTML files use these tokens, which `setup.py` replaces:

| Token | Example value |
|---|---|
| `__COMPANY_NAME__` | Acme Properties |
| `__COMPANY_NAME_FULL__` | Acme Properties, LLC |
| `__COMPANY_TAGLINE__` | Your Space, Our Priority |
| `__SITE_URL__` | https://acme.example.com/ |
| `__GA_ID__` | G-XXXXXXXXXX |

### Configuration in JS

`js/config.js` contains the `SITE_CONFIG` object. `app.js` reads from it for all brand-specific behavior: company name in share text, inquiry email addresses, localStorage key prefixes, map pin colors, etc.

### CSS Variables

`css/style.css` defines `--red` and `--red-dark` for the brand color. `setup.py` swaps these to the client's chosen color.

## Required Assets

After running `setup.py`, add these files to the output directory:

| File | Purpose |
|---|---|
| `images/logos/logo-white.svg` | Header logo (on dark background) |
| `images/logos/logo-dark.svg` | Print page logo (on white background) |
| `images/logos/favicon.svg` | Browser tab icon (SVG) |
| `images/logos/favicon.png` | Browser tab icon (PNG fallback) |
| `images/og-image.jpg` | Social media preview image (1200x630) |

Placeholder logos are included so the site renders before you drop in real ones.

## Data Source

The site pulls data from a Google Sheet with three tabs:

### Buildings tab

| Column | Required | Description |
|---|---|---|
| building_id | Yes | Unique ID (e.g. "NLB") |
| building_name | Yes | Display name |
| address | Yes | Street address |
| city | Yes | City |
| state | Yes | State abbreviation |
| zip | Yes | ZIP code |
| latitude | Yes | For map pin placement |
| longitude | Yes | For map pin placement |
| description | No | Short description shown on detail page |
| photo_filename | No | Filename in images/ folder, or Google Drive file ID |
| listing_type | No | "lease" or "sale" |
| asking_price | No | For sale listings only |
| map_group | No | Group multiple buildings under one map pin |
| broker | No | Comma-separated broker names to show for this building |

### Suites tab

| Column | Required | Description |
|---|---|---|
| suite_id | Yes | Unique ID (e.g. "NLB-200") |
| building_id | Yes | Must match a Buildings row |
| suite_number | Yes | Display label (e.g. "Suite 200") |
| floor | No | Floor number |
| square_feet | No | Leasable area |
| lease_rate | No | Rate (e.g. "18.50") |
| rate_unit | No | Unit label (e.g. "/SF/yr") |
| status | Yes | "Available", "Pending", or "Leased" |
| available_date | No | ISO date (e.g. "2025-08-01") |
| floor_plan_filename | No | Filename or Google Drive file ID |
| brochure_filename | No | Filename or Google Drive file ID |
| notes | No | Shown on suite card |

### Contacts tab

| Column | Required | Description |
|---|---|---|
| name | Yes | Broker name |
| title | No | Job title |
| phone | No | Phone number |
| email | Yes | Email address |
| photo_filename | No | Filename in images/ folder |

### Local Fallback

If no Google Sheet ID is configured, the site loads from `data/buildings.json`, `data/suites.json`, and `data/contacts.json`. Sample files are included.

## Deployment

The output is a static site — deploy the folder to any static host (GitHub Pages, Netlify, S3, etc.). No build step required.

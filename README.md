# Ogden Office Space — Leasing Website

A static website showing commercial office space available for lease, managed by Ogden & Company.

People will mostly reach it by scanning a QR code on their phone. It works great on mobile and desktop.

---

## How to update listings (Google Sheets — recommended)

The easiest way: use a **Google Sheet** as the live data source. You edit the sheet, and the website updates automatically — no rebuilding, no redeploying.

### One-time setup

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Create three tabs named exactly: **Buildings**, **Suites**, **Contacts**
3. Copy the column headers and data from `Ogden_Office_Listings.xlsx` into each tab
4. Click **File -> Share -> Publish to web** -> choose "Entire document" -> click **Publish**
5. Click **Share** (top right) -> change to **"Anyone with the link"** can view
6. Copy the Sheet ID from the URL — it's the long string between `/d/` and `/edit`:
   `https://docs.google.com/spreadsheets/d/`**YOUR_SHEET_ID**`/edit`
7. Open `site/js/app.js` and paste the ID into the config at the top:
   ```js
   GOOGLE_SHEET_ID: "YOUR_SHEET_ID",
   ```
8. Deploy the site once (see "How to redeploy" below)

After that, just edit the Google Sheet — the site pulls fresh data every time someone visits.

### Updating via the Excel file (alternative)

If you prefer to skip Google Sheets, the site can also read from local JSON files generated from the Excel file `Ogden_Office_Listings.xlsx`. Leave `GOOGLE_SHEET_ID` blank in the config and follow the "Running the build" section below after each spreadsheet edit.

### Mark a suite as leased

1. Open the **Suites** tab (in Google Sheets or Excel).
2. Find the suite row.
3. Change the **status** column from `Available` to `Leased`.
4. If using Google Sheets, you're done. If using Excel, save and rebuild/redeploy.

### Add a new suite

1. Open the **Suites** tab.
2. Add a new row at the bottom.
3. Fill in:
   - **suite_id** — a unique ID (e.g., `BWY-202`)
   - **building_id** — must match the building's ID from the Buildings tab (e.g., `BWY`)
   - **suite_number** — what tenants see (e.g., `Suite 202`)
   - **floor** — floor number
   - **square_feet** — total square footage
   - **lease_rate** — dollar amount (e.g., `16.00`)
   - **rate_unit** — usually `/SF/yr`
   - **status** — `Available`, `Leased`, or `Pending`
   - **available_date** — when it's available (e.g., `2025-08-01` or `Now`)
   - **floor_plan_filename** — filename of the floor plan image (optional)
   - **notes** — any notes (optional)
4. Save and redeploy.

### Add a new building

1. Open the **Buildings** tab.
2. Add a new row with:
   - **building_id** — a short unique code (e.g., `PARK`)
   - **building_name** — display name
   - **address, city, state, zip**
   - **latitude, longitude** — needed for the map pin (see below)
   - **description** — a sentence or two about the building
   - **photo_filename** — filename for the building photo (optional)
3. Save and redeploy.
4. Add suite rows in the Suites tab using the new building_id.

### Get latitude/longitude from Google Maps

1. Go to [Google Maps](https://maps.google.com).
2. Search for the building address.
3. Right-click on the building's location on the map.
4. Click the coordinates that appear (e.g., `43.0455, -87.9103`) — this copies them.
5. Paste the first number into the **latitude** column, the second into **longitude**.

### Add building photos or floor plans

1. Name the image file to match what's in the spreadsheet (e.g., `northern-lights.jpg`, `nlb-200.svg`).
2. Drop the file into the `site/images/` folder.
3. Redeploy.

---

## How to redeploy

### Option A: Netlify drag-and-drop (simplest)

1. Run the build (see below), or ask someone to run it for you.
2. Go to [app.netlify.com](https://app.netlify.com) and log in.
3. Drag the entire `site` folder onto the deploy area.
4. Done — your site is live in seconds.

### Option B: GitHub + Netlify auto-deploy (best for ongoing updates)

If the project is connected to GitHub and Netlify:

1. Edit the spreadsheet.
2. Drop any new images into `site/images/`.
3. Run the build: `python3 build.py`
4. Commit and push to GitHub.
5. Netlify automatically rebuilds and deploys.

### Running the build

You need Python 3 and the `openpyxl` package:

```bash
pip install openpyxl     # first time only
python3 build.py         # converts the spreadsheet to JSON
```

This reads `Ogden_Office_Listings.xlsx` and writes JSON files into `site/data/`. The site loads these JSON files to display listings.

---

## Project structure

```
Ogden_Office_Listings.xlsx   <- the spreadsheet (edit this)
build.py                     <- converts spreadsheet -> JSON
site/                        <- deploy this folder
  index.html                 <- home page (map + building list)
  building.html              <- building detail page
  css/style.css              <- styles
  js/app.js                  <- site logic
  data/                      <- JSON files (generated by build.py)
    buildings.json
    suites.json
    contacts.json
  images/                    <- drop building photos + floor plans here
    logos/                   <- Ogden logo files
```

## Config

In `site/js/app.js`, near the top:

```js
const CONFIG = {
  SHOW_LEASED: true,
  GOOGLE_SHEET_ID: "",  // paste your Google Sheet ID here
};
```

- **SHOW_LEASED** — set `false` to hide leased suites entirely instead of greying them out
- **GOOGLE_SHEET_ID** — paste your Sheet ID here to pull live data from Google Sheets (no rebuild needed). Leave blank to use local JSON files.

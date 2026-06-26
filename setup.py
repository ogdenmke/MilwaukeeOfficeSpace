#!/usr/bin/env python3
"""
Rebrand the office-space site for a new client.

Reads current values from site/js/config.js, prompts for replacements,
then updates config.js, all HTML files, and the CSS variables.

Usage:
    python3 setup.py
"""

import json
import os
import re
import sys
import textwrap

SITE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
CONFIG_PATH = os.path.join(SITE_DIR, "js", "config.js")
CSS_PATH = os.path.join(SITE_DIR, "css", "style.css")

HTML_FILES = [
    os.path.join(SITE_DIR, f)
    for f in ("index.html", "building.html", "find-space.html", "404.html", "map-print.html")
]


def read_current_config():
    """Parse SITE_CONFIG values from config.js."""
    with open(CONFIG_PATH, "r") as f:
        text = f.read()
    cfg = {}
    for m in re.finditer(r'(\w+):\s*"([^"]*)"', text):
        cfg[m.group(1)] = m.group(2)
    arr_match = re.search(r'INQUIRY_EMAILS:\s*\[([^\]]+)\]', text)
    if arr_match:
        cfg["INQUIRY_EMAILS"] = [
            e.strip().strip('"').strip("'") for e in arr_match.group(1).split(",")
        ]
    for m in re.finditer(r'(\w+):\s*(true|false)', text):
        cfg[m.group(1)] = m.group(2) == "true"
    return cfg


def prompt(label, default=""):
    display = f"  {label}" + (f" [{default}]" if default else "") + ": "
    val = input(display).strip()
    return val if val else default


def darken_hex(hex_color, factor=0.82):
    """Darken a hex color for hover states."""
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    r, g, b = int(r * factor), int(g * factor), int(b * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


def replace_in_file(path, old, new):
    with open(path, "r") as f:
        text = f.read()
    if old not in text:
        return 0
    count = text.count(old)
    text = text.replace(old, new)
    with open(path, "w") as f:
        f.write(text)
    return count


def write_config(cfg):
    emails_js = json.dumps(cfg["INQUIRY_EMAILS"])
    content = textwrap.dedent(f"""\
        /* Site configuration — all client-specific values in one place.
           setup.py rewrites this file when rebranding for a new client. */

        const SITE_CONFIG = {{
          COMPANY_NAME: "{cfg['COMPANY_NAME']}",
          COMPANY_NAME_FULL: "{cfg['COMPANY_NAME_FULL']}",
          COMPANY_TAGLINE: "{cfg['COMPANY_TAGLINE']}",
          SITE_URL: "{cfg['SITE_URL']}",

          GOOGLE_SHEET_ID: "{cfg['GOOGLE_SHEET_ID']}",
          SHOW_LEASED: {str(cfg['SHOW_LEASED']).lower()},

          BRAND_COLOR: "{cfg['BRAND_COLOR']}",
          BRAND_COLOR_DARK: "{cfg['BRAND_COLOR_DARK']}",

          LOGO_WHITE: "{cfg['LOGO_WHITE']}",
          LOGO_DARK: "{cfg['LOGO_DARK']}",

          INQUIRY_EMAILS: {emails_js},

          GA_ID: "{cfg['GA_ID']}",

          STORAGE_PREFIX: "{cfg['STORAGE_PREFIX']}",
        }};
    """)
    with open(CONFIG_PATH, "w") as f:
        f.write(content)


def main():
    print("\n=== Office Space Site — Setup ===\n")

    if not os.path.exists(CONFIG_PATH):
        print(f"Error: {CONFIG_PATH} not found.")
        sys.exit(1)

    old = read_current_config()
    old_name = old.get("COMPANY_NAME", "")
    old_name_full = old.get("COMPANY_NAME_FULL", "")
    old_tagline = old.get("COMPANY_TAGLINE", "")
    old_url = old.get("SITE_URL", "")
    old_color = old.get("BRAND_COLOR", "#CF152D")
    old_color_dark = old.get("BRAND_COLOR_DARK", darken_hex(old_color))

    print(f"Current branding: {old_name}")
    print(f"Enter new values (press Enter to keep current):\n")

    new_name = prompt("Company name", old_name)
    new_name_full = prompt("Company name (legal)", old_name_full)
    new_tagline = prompt("Tagline", old_tagline)
    new_url = prompt("Site URL", old_url)
    new_sheet = prompt("Google Sheet ID", old.get("GOOGLE_SHEET_ID", ""))
    new_color = prompt("Brand color (hex)", old_color)
    new_color_dark_default = darken_hex(new_color) if new_color != old_color else old_color_dark
    new_color_dark = prompt("Brand color dark (hex)", new_color_dark_default)
    new_logo_white = prompt("Logo (white, for header)", old.get("LOGO_WHITE", "images/logos/logo-white.svg"))
    new_logo_dark = prompt("Logo (dark, for print)", old.get("LOGO_DARK", "images/logos/logo-dark.svg"))

    emails_default = ", ".join(old.get("INQUIRY_EMAILS", []))
    new_emails_str = prompt("Inquiry emails (comma-separated)", emails_default)
    new_emails = [e.strip() for e in new_emails_str.split(",") if e.strip()]

    new_ga = prompt("Google Analytics ID", old.get("GA_ID", ""))
    new_prefix = prompt("Storage prefix", old.get("STORAGE_PREFIX", "office"))

    new_cfg = {
        "COMPANY_NAME": new_name,
        "COMPANY_NAME_FULL": new_name_full,
        "COMPANY_TAGLINE": new_tagline,
        "SITE_URL": new_url,
        "GOOGLE_SHEET_ID": new_sheet,
        "SHOW_LEASED": old.get("SHOW_LEASED", True),
        "BRAND_COLOR": new_color,
        "BRAND_COLOR_DARK": new_color_dark,
        "LOGO_WHITE": new_logo_white,
        "LOGO_DARK": new_logo_dark,
        "INQUIRY_EMAILS": new_emails,
        "GA_ID": new_ga,
        "STORAGE_PREFIX": new_prefix,
    }

    print("\n--- Applying changes ---\n")

    write_config(new_cfg)
    print(f"  Updated config.js")

    # Replace company name in HTML files
    replacements = []
    if old_name and new_name != old_name:
        replacements.append((old_name, new_name))
    if old_name_full and new_name_full != old_name_full:
        replacements.append((old_name_full, new_name_full))
    if old_tagline and new_tagline != old_tagline:
        replacements.append((old_tagline, new_tagline))
    if old_url and new_url != old_url:
        replacements.append((old_url, new_url))

    # Replace logo references in HTML
    old_logo_white = old.get("LOGO_WHITE", "")
    old_logo_dark = old.get("LOGO_DARK", "")
    if old_logo_white and new_logo_white != old_logo_white:
        replacements.append((old_logo_white, new_logo_white))
    if old_logo_dark and new_logo_dark != old_logo_dark:
        replacements.append((old_logo_dark, new_logo_dark))

    # Replace GA ID in HTML
    old_ga = old.get("GA_ID", "")
    if old_ga and new_ga != old_ga:
        replacements.append((old_ga, new_ga))

    for filepath in HTML_FILES:
        if not os.path.exists(filepath):
            continue
        fname = os.path.basename(filepath)
        total = 0
        for old_val, new_val in replacements:
            total += replace_in_file(filepath, old_val, new_val)
        if total:
            print(f"  {fname}: {total} replacement(s)")

    # Update CSS variables
    if new_color != old_color or new_color_dark != old_color_dark:
        count = 0
        if old_color and new_color != old_color:
            count += replace_in_file(CSS_PATH, old_color, new_color)
        if old_color_dark and new_color_dark != old_color_dark:
            count += replace_in_file(CSS_PATH, old_color_dark, new_color_dark)
        if count:
            print(f"  style.css: {count} color replacement(s)")

    # Also replace hardcoded brand color in map-print.html inline styles
    map_print = os.path.join(SITE_DIR, "map-print.html")
    if os.path.exists(map_print) and old_color and new_color != old_color:
        count = replace_in_file(map_print, old_color, new_color)
        if count:
            print(f"  map-print.html: {count} inline color replacement(s)")

    print(f"\n  Done! Don't forget to:")
    print(f"  1. Place your logo files at:")
    print(f"     - site/{new_logo_white}")
    print(f"     - site/{new_logo_dark}")
    print(f"     - site/images/logos/favicon.svg")
    print(f"     - site/images/logos/favicon.png")
    print(f"  2. Place your OG image at site/images/og-image.jpg")
    print(f"  3. Update the hero text in site/index.html if needed")
    print(f"  4. Push to deploy\n")


if __name__ == "__main__":
    main()

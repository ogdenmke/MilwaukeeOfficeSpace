#!/usr/bin/env python3
"""
Set up a new client site from the template.

Copies template/ to a target directory, prompts for client-specific values,
then fills in config.js, replaces __PLACEHOLDER__ tokens in HTML files,
and swaps CSS color variables.

Usage:
    python3 setup.py                  # outputs to new-site/
    python3 setup.py ./my-client      # outputs to ./my-client/
"""

import json
import os
import re
import shutil
import sys
import textwrap

ROOT = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(ROOT, "template")


def prompt(label, default=""):
    display = f"  {label}" + (f" [{default}]" if default else "") + ": "
    val = input(display).strip()
    return val if val else default


def darken_hex(hex_color, factor=0.82):
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


def write_config(path, cfg):
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
    with open(path, "w") as f:
        f.write(content)


def main():
    print("\n=== Office Space Site — New Client Setup ===\n")

    if not os.path.isdir(TEMPLATE_DIR):
        print(f"Error: template/ directory not found at {TEMPLATE_DIR}")
        sys.exit(1)

    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "new-site")

    if os.path.exists(out_dir):
        resp = input(f"  {out_dir} already exists. Overwrite? [y/N]: ").strip().lower()
        if resp != "y":
            print("  Aborted.")
            sys.exit(0)
        shutil.rmtree(out_dir)

    print(f"  Output directory: {out_dir}\n")
    print("Enter client values:\n")

    name = prompt("Company name")
    name_full = prompt("Company name (legal)", name)
    tagline = prompt("Tagline", "")
    site_url = prompt("Site URL")
    sheet_id = prompt("Google Sheet ID")
    color = prompt("Brand color (hex)", "#CF152D")
    color_dark = prompt("Brand color dark (hex)", darken_hex(color))
    logo_white = prompt("Logo filename (white, for header)", "images/logos/logo-white.svg")
    logo_dark = prompt("Logo filename (dark, for print)", "images/logos/logo-dark.svg")

    emails_str = prompt("Inquiry emails (comma-separated)")
    emails = [e.strip() for e in emails_str.split(",") if e.strip()]

    ga_id = prompt("Google Analytics ID", "")
    prefix = prompt("Storage prefix", name.lower().split()[0] if name else "office")

    cfg = {
        "COMPANY_NAME": name,
        "COMPANY_NAME_FULL": name_full,
        "COMPANY_TAGLINE": tagline,
        "SITE_URL": site_url.rstrip("/") + "/" if site_url else "",
        "GOOGLE_SHEET_ID": sheet_id,
        "SHOW_LEASED": True,
        "BRAND_COLOR": color,
        "BRAND_COLOR_DARK": color_dark,
        "LOGO_WHITE": logo_white,
        "LOGO_DARK": logo_dark,
        "INQUIRY_EMAILS": emails,
        "GA_ID": ga_id,
        "STORAGE_PREFIX": prefix,
    }

    # Copy template
    print("\n--- Setting up site ---\n")
    shutil.copytree(TEMPLATE_DIR, out_dir)
    print(f"  Copied template/ -> {out_dir}")

    # Write config.js
    config_path = os.path.join(out_dir, "js", "config.js")
    write_config(config_path, cfg)
    print(f"  Wrote config.js")

    # Replace placeholders in HTML files
    placeholders = {
        "__COMPANY_NAME_FULL__": name_full,
        "__COMPANY_NAME__": name,
        "__COMPANY_TAGLINE__": tagline,
        "__SITE_URL__": cfg["SITE_URL"],
        "__GA_ID__": ga_id,
    }

    html_files = []
    for f in os.listdir(out_dir):
        if f.endswith(".html"):
            html_files.append(os.path.join(out_dir, f))

    for filepath in html_files:
        fname = os.path.basename(filepath)
        total = 0
        for placeholder, value in placeholders.items():
            total += replace_in_file(filepath, placeholder, value)
        if total:
            print(f"  {fname}: {total} placeholder(s) filled")

    # Swap CSS brand colors (template ships with #CF152D default)
    css_path = os.path.join(out_dir, "css", "style.css")
    if color != "#CF152D":
        count = replace_in_file(css_path, "#CF152D", color)
        if count:
            print(f"  style.css: {count} color replacement(s)")
    if color_dark != "#a8112a":
        count = replace_in_file(css_path, "#a8112a", color_dark)
        if count:
            print(f"  style.css: {count} dark color replacement(s)")

    print(f"\n  Done! Next steps:")
    print(f"  1. Place your logo files at:")
    print(f"     - {out_dir}/{logo_white}")
    print(f"     - {out_dir}/{logo_dark}")
    print(f"     - {out_dir}/images/logos/favicon.svg")
    print(f"     - {out_dir}/images/logos/favicon.png")
    print(f"  2. Place your OG image at {out_dir}/images/og-image.jpg")
    print(f"  3. Update the hero text in {out_dir}/index.html if needed")
    print(f"  4. Add building photos to {out_dir}/images/")
    print(f"  5. Deploy the {out_dir}/ folder\n")


if __name__ == "__main__":
    main()

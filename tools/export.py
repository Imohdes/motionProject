#!/usr/bin/env python3
"""
Export the dashboard for delivery.

  python3 tools/export.py

Creates in dist/:
  liqaat-dashboard.html  one self-contained file (CSS, JS, data, fonts and images inlined)
  liqaat-dashboard.zip   the editable project folder (index.html + css/js/data/assets)
"""
import base64
import mimetypes
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
NAME = "liqaat-dashboard"

ZIP_ITEMS = ["index.html", "README.md", "css", "js", "data", "assets", "tools"]
ZIP_SKIP = {"__pycache__"}


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


def data_uri(rel):
    path = os.path.join(ROOT, rel)
    mime = mimetypes.guess_type(path)[0] or ("font/woff2" if path.endswith(".woff2") else "application/octet-stream")
    with open(path, "rb") as fh:
        return f"data:{mime};base64,{base64.b64encode(fh.read()).decode('ascii')}"


def inline_css(rel):
    css = read(rel)
    base = os.path.dirname(rel)

    def repl(m):
        url = m.group(1)
        if url.startswith(("data:", "#")):
            return m.group(0)
        return f'url("{data_uri(os.path.normpath(os.path.join(base, url)))}")'

    return re.sub(r'url\("?([^")]+)"?\)', repl, css)


def inline_asset_paths(text):
    # any "assets/img/..." string literal used in HTML or data files
    return re.sub(r'(["\'])(assets/img/[^"\']+)\1', lambda m: m.group(1) + data_uri(m.group(2)) + m.group(1), text)


def build_single_file():
    html = read("index.html")
    html = re.sub(
        r'<link rel="stylesheet" href="([^"]+)">',
        lambda m: "<style>\n" + inline_css(m.group(1)) + "\n</style>",
        html,
    )
    html = re.sub(
        r'<script src="([^"]+)"></script>',
        # "</script" inside inlined code would close the tag early
        lambda m: "<script>\n" + inline_asset_paths(read(m.group(1))).replace("</script", "<\\/script") + "\n</script>",
        html,
    )
    html = inline_asset_paths(html)
    leftovers = re.findall(r'(?:src|href)="(?!data:|#|https?:|\$\{)[^"]+"', html)
    if leftovers:
        raise SystemExit(f"un-inlined references remain: {leftovers}")
    out = os.path.join(DIST, NAME + ".html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    return out


def build_zip():
    out = os.path.join(DIST, NAME + ".zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in ZIP_ITEMS:
            src = os.path.join(ROOT, item)
            if os.path.isfile(src):
                zf.write(src, os.path.join(NAME, item))
                continue
            for dirpath, dirnames, filenames in os.walk(src):
                dirnames[:] = [d for d in dirnames if d not in ZIP_SKIP]
                for f in sorted(filenames):
                    full = os.path.join(dirpath, f)
                    zf.write(full, os.path.join(NAME, os.path.relpath(full, ROOT)))
    return out


def main():
    os.makedirs(DIST, exist_ok=True)
    for path in (build_single_file(), build_zip()):
        print(f"{os.path.relpath(path, ROOT)}  {os.path.getsize(path) / 1024:.0f} KB")


if __name__ == "__main__":
    main()

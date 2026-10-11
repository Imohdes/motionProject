#!/usr/bin/env python3
"""
Build data/map-data.js from the geoBoundaries ADM1 GeoJSON of Saudi Arabia.

Source: geoBoundaries gbOpen SAU ADM1 (derived from OpenStreetMap, ODbL 1.0).
Usage:  pip install shapely && python3 tools/build-map.py

Correction applied (see apply_corrections): both geoBoundaries and Natural Earth
assign the Red Sea coast of Asir (Al Birk / Al Qahma governorates, ~140 km of
coastline) to Makkah and Jazan. That strip is transferred to Asir here.

Output: window.LIQAAT_MAP = { viewBox, regions: { id: { iso, d, label:[x,y] } } }
The projection is an equirectangular projection with a standard parallel at
24°N (good fidelity for the Kingdom's latitude range). Geography is never
mirrored: the SVG stays LTR even though the page is RTL.
"""
import heapq
import json
import math
import os

from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "source", "geoBoundaries-SAU-ADM1_simplified.geojson")
OUT = os.path.join(ROOT, "data", "map-data.js")

# Target drawing size (SVG user units ~ stage pixels)
TARGET_W = 900.0
PAD = 14.0
PHI0 = math.radians(24.0)
SIMPLIFY_TOL = 0.35  # px – Douglas-Peucker tolerance
MIN_ISLAND_AREA = 6.0  # px² – drop specks smaller than this

ISO_TO_ID = {
    "SA-01": "riyadh",
    "SA-02": "makkah",
    "SA-03": "madinah",
    "SA-04": "eastern",
    "SA-05": "qassim",
    "SA-06": "hail",
    "SA-07": "tabuk",
    "SA-08": "northern-borders",
    "SA-09": "jazan",
    "SA-10": "najran",
    "SA-11": "bahah",
    "SA-12": "jawf",
    "SA-14": "asir",
}

# Manual nudges (px) for labels whose pole-of-inaccessibility is visually awkward
LABEL_NUDGE = {
    "eastern": (40, -70),
    "makkah": (10, 10),
    "jazan": (6, 16),
}


# Asir coastal strip: Makkah south of this latitude, Jazan north of this latitude
ASIR_COAST_NORTH_LAT = 18.65  # north of Al Birk governorate (Hali stays in Makkah)
ASIR_COAST_SOUTH_LAT = 17.93  # south of Al Qahma (Ash Shuqayq stays in Jazan)
ASIR_COAST_EAST_LON = 42.05   # only the coastal plain, not inland Jazan


def apply_corrections(geoms):
    makkah, jazan, asir = geoms["SA-02"], geoms["SA-09"], geoms["SA-14"]
    from_makkah = makkah.intersection(box(38.0, 16.0, 45.0, ASIR_COAST_NORTH_LAT))
    from_jazan = jazan.intersection(box(38.0, ASIR_COAST_SOUTH_LAT, ASIR_COAST_EAST_LON, 20.0))
    geoms["SA-02"] = makkah.difference(from_makkah)
    geoms["SA-09"] = jazan.difference(from_jazan)
    merged = unary_union([asir, from_makkah, from_jazan])
    # close hairline gaps left by imperfectly shared source edges
    geoms["SA-14"] = merged.buffer(1e-5).buffer(-1e-5)
    return geoms


def project(lon, lat):
    return (math.radians(lon) * math.cos(PHI0), -math.radians(lat))


def rings_of(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return polys


def area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def dp(points, tol):
    """Iterative Douglas-Peucker."""
    if len(points) < 4:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if L == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


# ---------- polylabel (pole of inaccessibility) ----------
def seg_dist2(px, py, a, b):
    x, y = a
    dx, dy = b[0] - x, b[1] - y
    if dx or dy:
        t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy)
        if t > 1:
            x, y = b
        elif t > 0:
            x += dx * t
            y += dy * t
    dx, dy = px - x, py - y
    return dx * dx + dy * dy


def point_to_poly(x, y, poly):
    inside = False
    md = float("inf")
    for ring in poly:
        n = len(ring)
        j = n - 1
        for i in range(n):
            a, b = ring[i], ring[j]
            if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
                inside = not inside
            md = min(md, seg_dist2(x, y, a, b))
            j = i
    return (1 if inside else -1) * math.sqrt(md)


def polylabel(poly, precision=1.0):
    xs = [p[0] for p in poly[0]]
    ys = [p[1] for p in poly[0]]
    minx, miny, maxx, maxy = min(xs), min(ys), max(xs), max(ys)
    size = min(maxx - minx, maxy - miny)
    h = size / 2
    heap = []

    def push(x, y, h):
        d = point_to_poly(x, y, poly)
        heapq.heappush(heap, (-(d + h * math.sqrt(2)), x, y, h, d))

    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            push(x + h, y + h, h)
            y += size
        x += size
    best = (sum(xs) / len(xs), sum(ys) / len(ys))
    best_d = point_to_poly(best[0], best[1], poly)
    while heap:
        _, x, y, h, d = heapq.heappop(heap)
        if d > best_d:
            best, best_d = (x, y), d
        if d + h * math.sqrt(2) - best_d <= precision:
            continue
        h /= 2
        for ox in (-h, h):
            for oy in (-h, h):
                push(x + ox, y + oy, h)
    return best


def main():
    gj = json.load(open(SRC, encoding="utf-8"))
    geoms = {f["properties"]["shapeISO"]: shape(f["geometry"]).buffer(0) for f in gj["features"]}
    geoms = apply_corrections(geoms)
    feats = []
    for iso in sorted(geoms):
        geom = mapping(geoms[iso])
        if geom["type"] == "GeometryCollection":
            raise SystemExit(f"unexpected geometry collection for {iso}")
        polys = [[[project(*pt) for pt in ring] for ring in poly] for poly in rings_of(geom)]
        feats.append((iso, polys))

    allpts = [pt for _, polys in feats for poly in polys for ring in poly for pt in ring]
    minx = min(p[0] for p in allpts)
    maxx = max(p[0] for p in allpts)
    miny = min(p[1] for p in allpts)
    maxy = max(p[1] for p in allpts)
    k = (TARGET_W - 2 * PAD) / (maxx - minx)
    W = TARGET_W
    H = (maxy - miny) * k + 2 * PAD

    def tx(p):
        return ((p[0] - minx) * k + PAD, (p[1] - miny) * k + PAD)

    regions = {}
    for iso, polys in feats:
        rid = ISO_TO_ID[iso]
        out_polys = []
        for poly in polys:
            rings = [[tx(p) for p in ring] for ring in poly]
            if abs(area(rings[0])) < MIN_ISLAND_AREA:
                continue
            rings = [dp(r, SIMPLIFY_TOL) for r in rings]
            rings = [r for r in rings if len(r) >= 4]
            if rings:
                out_polys.append(rings)
        parts = []
        for poly in out_polys:
            for ring in poly:
                pts = ring[:-1] if ring[0] == ring[-1] else ring
                s = "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"
                parts.append(s)
        main_poly = max(out_polys, key=lambda p: abs(area(p[0])))
        lx, ly = polylabel(main_poly, 0.5)
        nx, ny = LABEL_NUDGE.get(rid, (0, 0))
        regions[rid] = {
            "iso": iso,
            "d": "".join(parts),
            "label": [round(lx + nx, 1), round(ly + ny, 1)],
        }

    data = {"viewBox": [0, 0, round(W, 1), round(H, 1)], "regions": regions}
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("/* Generated by tools/build-map.py – do not edit by hand.\n")
        fh.write(" * Boundaries: geoBoundaries gbOpen SAU ADM1 (2017), derived from\n")
        fh.write(" * OpenStreetMap © OpenStreetMap contributors, ODbL 1.0. */\n")
        fh.write("window.LIQAAT_MAP = ")
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    print(f"wrote {OUT}: {os.path.getsize(OUT)} bytes, viewBox {W:.0f}x{H:.0f}")
    for rid, r in regions.items():
        print(f"  {rid:18s} label {r['label']}")


if __name__ == "__main__":
    main()

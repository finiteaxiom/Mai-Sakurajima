"""Read-only pixel analysis: write frame coordinates, never modify artwork.

Development dependency: Pillow, numpy, scipy. Runtime consumes only JSON.
Usage: python scripts/inspect-pet-sheet.py renderer/media/wardrobe/school.png
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

source = Path(sys.argv[1])
row_count = int(sys.argv[2]) if len(sys.argv) > 2 else 8
column_count = int(sys.argv[3]) if len(sys.argv) > 3 else 4
expected_count = row_count * column_count
image = Image.open(source).convert('RGBA')
alpha = np.array(image)[:, :, 3]
labels, _ = ndimage.label(alpha > 96)
areas = np.bincount(labels.ravel())
objects = ndimage.find_objects(labels)
figures = []
for label, region in enumerate(objects, 1):
    if region is None or areas[label] < 1200:
        continue
    ys, xs = region
    if ys.stop - ys.start < image.height / (row_count * 2):
        continue
    figures.append([xs.start, ys.start, xs.stop, ys.stop])
if len(figures) != expected_count:
    # Some sheets have adjacent hair/boot edge pixels touching across rows.
    # Locate the narrowest horizontal separator near each expected row edge.
    density = (alpha > 96).sum(axis=1)
    edges = [0]
    for row in range(1, row_count):
        expected = round(image.height * row / row_count)
        radius = round(image.height / row_count * 0.12)
        lo, hi = expected - radius, expected + radius
        edges.append(lo + int(np.argmin(density[lo:hi])))
    edges.append(image.height)
    figures = []
    for start, end in zip(edges, edges[1:]):
        band_labels, _ = ndimage.label(alpha[start:end] > 96)
        band_areas = np.bincount(band_labels.ravel())
        for label, region in enumerate(ndimage.find_objects(band_labels), 1):
            if region is None or band_areas[label] < 1200:
                continue
            ys, xs = region
            if ys.stop - ys.start >= image.height / (row_count * 2):
                figures.append([xs.start, ys.start + start, xs.stop, ys.stop + start])
    print('Row separators:', edges)
    if len(figures) != expected_count:
        raise SystemExit(f'Expected {expected_count} figures after separating rows, found {len(figures)}; inspect artwork.')
# Sort by vertical center, then group four actors per action row.
figures.sort(key=lambda r: (r[1] + r[3]) / 2)
rows = [sorted(figures[i:i + column_count], key=lambda r: r[0]) for i in range(0, expected_count, column_count)]
frames = []
for row in rows:
    for x0, y0, x1, y1 in row:
        # Include antialiased edge pixels while keeping neighboring actors out.
        x, y = max(0, x0 - 1), y0
        w, h = min(image.width, x1 + 1) - x, y1 - y
        # Anchor on the head silhouette instead of changing arm/prop extents.
        head = alpha[y0:y0 + max(1, (y1 - y0) // 4), x0:x1] > 96
        occupied = np.where(head.any(axis=0))[0]
        anchor = float(x0 + (occupied.min() + occupied.max()) / 2)
        frames.append({'x': x, 'y': y, 'width': w, 'height': h, 'anchorX': anchor, 'baseline': y1})
metadata = {'imageWidth': image.width, 'imageHeight': image.height,
            'standingHeight': max(r[3] - r[1] for r in rows[0]), 'frames': frames}
source.with_suffix('.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
print(json.dumps({'file': str(source), 'figures': len(frames), 'size': image.size,
                  'standingHeight': metadata['standingHeight']}))

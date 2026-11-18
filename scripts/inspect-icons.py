import glob, os, re

for f in sorted(glob.glob('src/assets/icons/*.svg')):
    name = os.path.basename(f)
    content = open(f, 'r', encoding='utf-8').read()
    fills = set(re.findall(r'fill="([^"]+)"', content))
    strokes = set(re.findall(r'stroke="([^"]+)"', content))
    print(f"{name:24}: fills={fills}, strokes={strokes}")

import math
from PIL import Image, ImageDraw

w, h = 1200, 700
img = Image.new('RGB', (w, h), (237, 251, 238))
d = ImageDraw.Draw(img)

# sky gradient
for y in range(h):
    t = y / h
    r = int(236 + (255 - 236) * t)
    g = int(250 + (245 - 250) * t)
    b = int(240 + (230 - 240) * t)
    d.line([(0, y), (w, y)], fill=(r, g, b))

# sunrise glow
for i in range(90, 0, -1):
    alpha = int(20 * (i / 90))
    rad = 240 + i * 2
    circle = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(circle)
    cd.ellipse((840 - rad, 120 - rad, 840 + rad, 120 + rad), fill=(255, 241, 164, alpha))
    img = Image.alpha_composite(img.convert('RGBA'), circle)

# hills and fields
layers = [
    ((30, 380, 170, 350, 300, 390, 450, 360, 600, 400, 750, 360, 920, 410, 1080, 380, 1200, 400), (196, 224, 166)),
    ((0, 430, 180, 370, 380, 450, 560, 420, 730, 470, 900, 430, 1080, 470, 1200, 450, 1200, 700, 0, 700), (218, 238, 203)),
    ((0, 500, 150, 450, 320, 540, 500, 500, 660, 540, 820, 500, 980, 540, 1160, 510, 1200, 560, 1200, 700, 0, 700), (135, 199, 111)),
    ((0, 560, 140, 530, 300, 615, 470, 560, 610, 610, 760, 560, 920, 610, 1080, 575, 1200, 600, 1200, 700, 0, 700), (182, 231, 166)),
]
for coords, color in layers:
    d.polygon(coords, fill=color)

# field lines
for y in [560, 600, 640]:
    pts = [(20, y), (200, y - 15), (380, y), (560, y - 20), (740, y), (920, y - 12), (1100, y)]
    d.line(pts, fill=(255, 255, 255), width=3)
for y in [520, 550, 585]:
    pts = [(40, y), (220, y - 10), (400, y + 5), (560, y - 8), (740, y + 2), (920, y - 6), (1100, y)]
    d.line(pts, fill=(255, 255, 255), width=2)

# farmer
fx, fy = 360, 450
# head
d.ellipse((fx - 24, fy - 80, fx + 24, fy - 32), fill=(232, 193, 143))
# body
d.rectangle((fx - 22, fy - 24, fx + 22, fy + 68), fill=(37, 97, 67))
# legs
d.rectangle((fx - 22, fy + 68, fx - 10, fy + 124), fill=(42, 76, 39))
d.rectangle((fx + 10, fy + 68, fx + 22, fy + 124), fill=(42, 76, 39))
# hat
d.polygon([(fx - 38, fy - 78), (fx + 38, fy - 78), (fx + 28, fy - 110), (fx - 28, fy - 110)], fill=(165, 120, 64))
# arms
d.line((fx - 22, fy + 10, fx - 82, fy - 25), fill=(255, 227, 160), width=14)
d.line((fx + 22, fy + 10, fx + 82, fy - 45), fill=(255, 227, 160), width=14)
# plant
px, py = fx + 72, fy - 24
for dy in [0, -18, -34, -48]:
    d.ellipse((px - 16, py + dy - 18, px + 16, py + dy + 2), fill=(76, 153, 48))
d.line((px, py + 4, px, py + 72), fill=(106, 73, 32), width=8)

# drone
dx, dy = 700, 220
d.polygon([(dx - 40, dy), (dx + 40, dy), (dx + 30, dy + 18), (dx - 30, dy + 18)], fill=(255, 255, 255))
d.rectangle((dx - 28, dy + 18, dx + 28, dy + 30), fill=(237, 247, 236))
for x in [dx - 40, dx + 40]:
    d.line((x, dy, x, dy + 44), fill=(255, 255, 255), width=4)
for x in [dx - 50, dx + 50]:
    d.line((x, dy - 10, x - (30 if x < dx else -30), dy - 36), fill=(255, 255, 255), width=5)

# satellite
sx, sy = 980, 120
d.ellipse((sx - 20, sy - 20, sx + 20, sy + 20), fill=(255, 255, 255))
d.rectangle((sx - 44, sy - 18, sx - 20, sy - 10), fill=(255, 255, 255))
d.rectangle((sx + 20, sy - 18, sx + 44, sy - 10), fill=(255, 255, 255))
d.line((sx - 26, sy - 2, sx - 56, sy - 16), fill=(255, 255, 255), width=3)
d.line((sx + 26, sy - 2, sx + 56, sy - 16), fill=(255, 255, 255), width=3)

# central AI element
cx, cy = 520, 340
d.ellipse((cx - 60, cy - 60, cx + 60, cy + 60), fill=(255, 255, 255, 50))
d.ellipse((cx - 42, cy - 42, cx + 42, cy + 42), fill=(57, 163, 85))
d.ellipse((cx - 30, cy - 20, cx + 30, cy + 20), fill=(255, 255, 255, 115))
d.ellipse((cx - 18, cy - 5, cx + 18, cy + 25), fill=(255, 255, 255, 90))
for angle in range(0, 360, 45):
    rad = math.radians(angle)
    x1 = cx + math.cos(rad) * 38
    y1 = cy + math.sin(rad) * 38
    x2 = cx + math.cos(rad) * 62
    y2 = cy + math.sin(rad) * 62
    d.line((x1, y1, x2, y2), fill=(255, 255, 255, 180), width=3)

# overlays and glow
overlay = Image.new('RGBA', (w, h), (255, 255, 255, 0))
od = ImageDraw.Draw(overlay)
od.ellipse((520, 120, 820, 320), fill=(255, 255, 255, 40))
od.ellipse((240, 540, 540, 680), fill=(255, 255, 255, 20))
od.polygon([(960, 420), (1040, 340), (1100, 360), (1020, 440)], fill=(255, 255, 255, 18))
img = Image.alpha_composite(img.convert('RGBA'), overlay)
img.convert('RGB').save('public/field-bg.png', optimize=True)
print('saved public/field-bg.png')

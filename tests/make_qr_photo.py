"""Make a fake 'photo' of a QR card (rotated, blurred, on a grey table).
Usage: python3 tests/make_qr_photo.py <text> <out.png>"""
import json, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFilter
text, out = sys.argv[1:3]
here = os.path.dirname(os.path.abspath(__file__))
js = ("const q=require(process.argv[1])(0,'M');q.addData(process.argv[2]);q.make();"
      "const n=q.getModuleCount(),m=[];for(let r=0;r<n;r++){let s='';for(let c=0;c<n;c++)s+=q.isDark(r,c)?'1':'0';m.push(s)}"
      "console.log(JSON.stringify(m))")
rows = json.loads(subprocess.check_output(['node', '-e', js, os.path.join(here, '..', 'vendor', 'qrcode.js'), text]))
n, cell = len(rows), 14
card = Image.new('L', ((n + 8) * cell, (n + 8) * cell), 245)
d = ImageDraw.Draw(card)
for r, row in enumerate(rows):
    for c, v in enumerate(row):
        if v == '1':
            d.rectangle([(c + 4) * cell, (r + 4) * cell, (c + 5) * cell - 1, (r + 5) * cell - 1], fill=25)
photo = Image.new('L', (3024 // 2, 4032 // 2), 120)
card = card.rotate(9, expand=True, fillcolor=120)
photo.paste(card, ((photo.width - card.width) // 2, (photo.height - card.height) // 2))
photo.filter(ImageFilter.GaussianBlur(2.2)).convert('RGB').save(out, quality=85)

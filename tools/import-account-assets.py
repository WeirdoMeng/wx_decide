#!/usr/bin/env python3
"""Render Mine tab icons using the same Flutter Material font as existing tabs."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parent.parent
font=ImageFont.truetype('/Users/apple/Desktop/Flutter/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',72)
for name,point,color in [('person_outline',0xe497,'#7580A0'),('person_rounded',0xf0071,'#6574FF')]:
 image=Image.new('RGBA',(72,72))
 ImageDraw.Draw(image).text((36,36),chr(point),font=font,fill=color,anchor='mm')
 image.save(root/'miniprogram/assets/original'/f'{name}.png',optimize=True)

#!/usr/bin/env python3
"""从只读 Flutter 主包导入聚会原图和精确 MaterialIcons 图标。"""
from pathlib import Path
import re, argparse, shutil, subprocess, tempfile, math
from PIL import Image, ImageFont, ImageDraw
from asset_png import save_ui_png
p=argparse.ArgumentParser()
p.add_argument('--source',default='/Users/apple/Desktop/Flutter/FlutterSpace/flutter_decide/assets/lib_res_main/res_project')
p.add_argument('--svg-only',action='store_true')
p.add_argument('--images-only',action='store_true')
p.add_argument('--flutter-sdk',default='/Users/apple/Desktop/Flutter/flutter')
a=p.parse_args()
src=Path(a.source); dst=Path(__file__).resolve().parent.parent/'miniprogram/assets/original/party';dst.mkdir(parents=True,exist_ok=True)
for f in src.iterdir():
 if not f.name.startswith(('party_','shark_game','truth_dare','balloon_','number_bomb')) or f.suffix not in ('.png','.svg'):continue
 if f.suffix=='.svg':
  if not a.images_only:shutil.copy2(f,dst/f.name)
  continue
 if a.svg_only:continue
 im=Image.open(f).convert('RGBA')
 maxsize=(562,1220) if 'background' in f.name else (600,600) if 'banner' in f.name else (380,380) if 'eight_ball' in f.name else (750,750)
 im.thumbnail(maxsize)
 if im.getextrema()[3]==(255,255):
  im.convert('RGB').save(dst/(f.stem+'.jpg'),quality=85,optimize=True)
  (dst/(f.stem+'.png')).unlink(missing_ok=True)
 else:save_ui_png(im,dst/(f.stem+'.png'),smooth=f.stem in {'party_banner_empty','party_action_button'})
if a.images_only:
 for old in dst.glob('*.webp'):old.unlink()
 print('PNG party images imported');raise SystemExit(0)
fontpath=Path(a.flutter_sdk)/'bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf'
source=(Path(a.flutter_sdk)/'packages/flutter/lib/src/material/icons.dart').read_text()
for name,colors in {'tune_rounded':['7A5DF4'],'volume_up_rounded':['6574FF'],'vibration_rounded':['6574FF'],'grid_view_rounded':['6574FF'],'play_arrow_rounded':['FFFFFF'],'shuffle_rounded':['FFFFFF'],'backspace_outlined':['7580A0'],'add_rounded':['121A38'],'remove_rounded':['121A38']}.items():
 match=re.search(r'static const IconData '+name+r'\s*=\s*IconData\(\s*(0x[0-9a-fA-F]+)',source)
 assert match,name
 for color in colors:
  im=Image.new('RGBA',(96,96));d=ImageDraw.Draw(im);font=ImageFont.truetype(str(fontpath),96)
  d.text((48,48),chr(int(match.group(1),16)),font=font,fill='#'+color,anchor='mm')
  im.save(dst/(name+'.png'),optimize=True)
print('聚会原资源',len(list(dst.iterdir())),'项',sum(f.stat().st_size for f in dst.iterdir()),'bytes')

for name,old,new in [('truth_dare_like_gray','white','#7C859E'),('truth_dare_dare_white','#7C859E','white')]:
 original=src/('truth_dare_like.svg' if 'like' in name else 'truth_dare_dare.svg')
 (dst/(name+'.svg')).write_text(original.read_text().replace(old,new))
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
for source in dst.glob('*.svg'):
 text=source.read_text();match=re.search(r'viewBox="([^"]+)"',text)
 if match:
  box=[float(x) for x in match[1].split()];w,h=box[2:4]
 else:
  w=float(re.search(r'width="([0-9.]+)',text)[1]);h=float(re.search(r'height="([0-9.]+)',text)[1])
 scale=min(3,900/max(w,h));width=math.ceil(w*scale);height=math.ceil(h*scale)
 with tempfile.TemporaryDirectory(prefix='wx-party-svg-') as directory:
  tmp=Path(directory);html=tmp/'asset.html'
  html.write_text('<html><style>html,body{margin:0;background:transparent;width:'+str(width)+'px;height:'+str(height)+'px;overflow:hidden}svg{width:100%;height:100%}</style>'+text+'</html>')
  subprocess.run([chrome,'--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--hide-scrollbars','--default-background-color=00000000','--window-size='+str(width)+','+str(height),'--user-data-dir='+str(tmp/'profile'),'--screenshot='+str(tmp/'asset.png'),html.as_uri()],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
  im=Image.open(tmp/'asset.png').convert('RGBA');im.save(dst/(source.stem+'.png'),optimize=True)
print('SVG original rasterization complete')

for name in ['balloon_glow','truth_dare_rear_card']:
 source=dst/(name+'.png')
 if source.exists():
  im=Image.open(source).convert('RGBA');save_ui_png(im,source)
for source in dst.glob('*.webp'):source.unlink()
for source in dst.glob('*.svg'):source.unlink()

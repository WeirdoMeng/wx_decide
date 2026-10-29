#!/usr/bin/env python3
"""Import original Flutter main-package UI assets without altering source files.
Package-safe PNG, with lossless key gradients and alpha-preserving palette artwork.
Material icons use the same SDK font and codepoints as the Flutter source.
SVGs are rasterized at 3x with local headless Chrome, transparent background.
"""
import argparse,re,subprocess,tempfile
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from asset_png import save_ui_png
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,default=Path('/Users/apple/Desktop/Flutter/FlutterSpace/flutter_decide/assets/lib_res_main/res_project'))
parser.add_argument('--flutter-sdk',type=Path,default=Path('/Users/apple/Desktop/Flutter/flutter'))
parser.add_argument('--svg-only',action='store_true')
parser.add_argument('--images-only',action='store_true')
parser.add_argument('--icons-only',action='store_true')
args=parser.parse_args();out=ROOT/'miniprogram/assets/original';out.mkdir(parents=True,exist_ok=True)
limits={'main_bg':700,'primary_button_bg':900,'home_logo':180,'blind_box_icon':132,'wheel_center':210,'result_dialog_bg':600,'result_icon':240,'number_tab_selected':540,'reset_icon':80,'touch_hint_card':600,'winner_smile':210}
icons={'donut_large_outlined':'#7580A0','donut_large_rounded':'#6574FF','celebration_outlined':'#7580A0','celebration_rounded':'#6574FF','tune_rounded':'#AA57FF','expand_more_rounded':'#7580A0','visibility_outlined':'#7580A0','visibility_off_outlined':'#C3CAE0','remove_circle_outline_rounded':'#FF6F88','casino_rounded':'#5A8CFF','refresh_rounded':'#7580A0','add_rounded':'#6574FF','dashboard_customize_outlined':'#7580A0','arrow_back_ios_new_rounded':'#121A38','check_circle_rounded':'#6574FF','add_circle_outline_rounded':'#6574FF','remove_rounded':'#7580A0','keyboard_arrow_up_rounded':'#6574FF','keyboard_arrow_down_rounded':'#6574FF'}
if not args.svg_only and not args.icons_only:
 for name,limit in limits.items():
  image=Image.open(args.source/(name+'.png')).convert('RGBA');image.thumbnail((limit,limit*3))
  if name=='main_bg':
   backdrop=Image.new('RGBA',image.size,'#F4F8FF');backdrop.alpha_composite(image);backdrop.convert('RGB').save(out/(name+'.jpg'),quality=85,optimize=True)
   (out/(name+'.png')).unlink(missing_ok=True)
  else:save_ui_png(image,out/(name+'.png'),exact=name in {'primary_button_bg','home_logo','blind_box_icon','wheel_center','result_dialog_bg'},smooth=name=='number_tab_selected')
 for source in args.source.glob('coin*_*.png'):
  image=Image.open(source).convert('RGBA');image.thumbnail((500,500));save_ui_png(image,out/(source.stem+'.png'))
 if args.images_only:
  for old in out.glob('*.webp'):old.unlink()
  print('PNG images imported');raise SystemExit(0)
if not args.svg_only:
 icon_source=(args.flutter_sdk/'packages/flutter/lib/src/material/icons.dart').read_text()
 font=ImageFont.truetype(str(args.flutter_sdk/'bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf'),72)
 for name,color in icons.items():
  match=re.search(r'static const IconData '+name+r'\s*=\s*IconData\(\s*(0x[0-9a-f]+)',icon_source)
  if not match:raise ValueError('Icon missing from SDK: '+name)
  image=Image.new('RGBA',(72,72));ImageDraw.Draw(image).text((36,36),chr(int(match[1],16)),font=font,fill=color,anchor='mm');image.save(out/(name+'.png'),optimize=True)
if not args.svg_only:
 image=Image.open(out/'add_rounded.png').convert('RGBA');colored=Image.new('RGBA',image.size,'#7580A0');colored.putalpha(image.getchannel('A'));colored.save(out/'add_counter.png',optimize=True)
if not args.svg_only:
 image=Image.open(out/'add_rounded.png').convert('RGBA');colored=Image.new('RGBA',image.size,'#C3CAE0');colored.putalpha(image.getchannel('A'));colored.save(out/'add_disabled.png',optimize=True)
if args.icons_only:
 print('Material icons imported in the original font em box');raise SystemExit(0)
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
for name,size in [('wheel_pointer',159),('list_edit_icon',72),('list_delete_icon',72)]:
 with tempfile.TemporaryDirectory(prefix='wx-original-svg-') as directory:
  tmp=Path(directory);html=tmp/'asset.html';html.write_text('<html><style>html,body{margin:0;background:transparent;width:'+str(size)+'px;height:'+str(size)+'px;overflow:hidden}svg{width:100%;height:100%}</style>'+ (args.source/(name+'.svg')).read_text()+'</html>')
  subprocess.run([chrome,'--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--hide-scrollbars','--default-background-color=00000000','--window-size='+str(size)+','+str(size),'--user-data-dir='+str(tmp/'profile'),'--screenshot='+str(tmp/'asset.png'),html.as_uri()],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
  image=Image.open(tmp/'asset.png').convert('RGBA');image.save(out/(name+'.png'),optimize=True)
print('Imported core assets:',sum(file.stat().st_size for file in out.iterdir() if file.is_file()),'bytes')
for old in out.glob('*.webp'):old.unlink()

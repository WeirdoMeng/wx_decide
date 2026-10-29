#!/usr/bin/env python3
"""Extract the original visible club, without a scene-loader dependency or geometry reduction."""
import argparse, hashlib, io, json, pathlib, struct
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('--source',default='/Users/apple/Desktop/WebSpace/mobile-3d-billiards');args=parser.parse_args()
source=pathlib.Path(args.source)/'public/assets';target=pathlib.Path(__file__).resolve().parents[1]/'miniprogram/billiards/assets/club';target.mkdir(parents=True,exist_ok=True)
original=(source/'models/club.babylon').read_bytes();club=json.loads(original);data=bytearray();meshes=[]
for mesh in club['meshes']:
 if mesh['name'] in ('MainLight','RoofLights'):continue # also disabled by the original main.ts
 item={k:mesh[k] for k in ('name','position','rotation','scaling','materialId') if k in mesh};item['buffers']={}
 for key in ('positions','normals','uvs','indices'):
  if key not in mesh:continue
  data.extend(b'\0'*(-len(data)%4));values=mesh[key];fmt='H' if key=='indices' else 'f';item['buffers'][key]={'offset':len(data),'length':len(values),'type':fmt};data.extend(struct.pack('<'+str(len(values))+fmt,*values))
 meshes.append(item)
files=['materials/table-wood.jpg','materials/frame-normal.png','materials/felt-diffuse.jpg','materials/felt-normal.jpg','models/pocket-normal.jpg','materials/pocket-glossy.jpg','materials/cue-wood-strip.png','models/room-com.jpg','models/ground-com.jpg','models/items-com.jpg','models/pillars-com.jpg','models/corridor-com.jpg'];textures=[]
for filename in files:
 limit=512 if filename in {'materials/table-wood.jpg','materials/frame-normal.png','models/room-com.jpg','models/items-com.jpg'} else 256
 raw=(source/filename).read_bytes();image=Image.open(io.BytesIO(raw));image.thumbnail((limit,limit),Image.Resampling.LANCZOS);name=pathlib.Path(filename).stem+'.jpg';out=io.BytesIO();image.convert('RGB').save(out,format='JPEG',quality=82,optimize=True);pixels=out.getvalue();(target/name).write_bytes(pixels);textures.append({'name':name,'width':image.width,'height':image.height,'source':filename,'sourceSha256':hashlib.sha256(raw).hexdigest(),'sha256':hashlib.sha256(pixels).hexdigest()})
manifest={'version':1,'sourceSha256':hashlib.sha256(original).hexdigest(),'geometrySha256':hashlib.sha256(data).hexdigest(),'geometryBytes':len(data),'meshes':meshes,'materials':club['materials'],'textures':textures};(target/'club.bin').write_bytes(data);(target/'scene.js').write_text('module.exports='+json.dumps(manifest,separators=(',',':'),ensure_ascii=False)+';\n');(target/'scene.json').unlink(missing_ok=True);print(json.dumps({'meshes':len(meshes),'geometryBytes':len(data),'textures':len(textures),'assetBytes':sum(p.stat().st_size for p in target.iterdir())}))

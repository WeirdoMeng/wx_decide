#!/usr/bin/env python3
"""从用户提供的 shaizi Unity 包提取经典骰盅、骰子及六面渲染输入。
依赖见 requirements-dice-assets.txt；随后执行 node tools/render-dice-assets.cjs。
"""
import argparse
import hashlib
import json
from pathlib import Path
import UnityPy
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=Path('/Users/apple/Desktop/开发资料/反编译相关/反编译项目/shaizi/app/src/main/assets/bin/Data/data.unity3d'))
parser.add_argument('--work-dir', type=Path, default=Path('/tmp/wx-decide-dice-assets'))
args = parser.parse_args()
args.work_dir.mkdir(parents=True, exist_ok=True)
assets = ROOT / 'miniprogram/dice/assets'
assets.mkdir(parents=True, exist_ok=True)
env = UnityPy.load(str(args.source))
manifest = {'source': 'shaizi/app/src/main/assets/bin/Data/data.unity3d', 'sha256': hashlib.sha256(args.source.read_bytes()).hexdigest(), 'unityPy': UnityPy.__version__, 'assets': []}
for obj in env.objects:
    if obj.assets_file.name != 'sharedassets0.assets':
        continue
    if obj.type.name == 'Sprite' and obj.path_id in (465, 505):
        data = obj.read()
        image = data.image.convert('RGBA')
        name = 'cup.png' if obj.path_id == 505 else 'die-preview.png'
        image.save(assets / name, optimize=True)
        if obj.path_id == 465:
            image.thumbnail((96, 96), Image.Resampling.LANCZOS)
            image.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(ROOT / 'miniprogram/assets/dice-entry.png', optimize=True)
        manifest['assets'].append({'pathId': obj.path_id, 'file': name, 'name': data.m_Name, 'type': 'Sprite'})
    elif obj.type.name == 'Mesh' and obj.path_id == 330:
        data = obj.read()
        obj_text = data.export()
        positions, normals, indices = [], [], []
        for line in obj_text.splitlines():
            if line.startswith('v '):
                positions.extend(float(n) * 100 for n in line.split()[1:4])
            elif line.startswith('vn '):
                normals.extend(float(n) for n in line.split()[1:4])
            elif line.startswith('f '):
                indices.extend(int(n.split('/')[0]) - 1 for n in line.split()[1:])
        if len(positions) != len(normals) or len(indices) % 3:
            raise ValueError('原骰子网格数据不完整')
        (args.work_dir / 'model.json').write_text(json.dumps({'positions': positions, 'normals': normals, 'indices': indices}, separators=(',', ':')))
        manifest['assets'].append({'pathId': 330, 'name': data.m_Name, 'type': 'Mesh', 'vertices': len(positions) // 3, 'output': 'die-1.png … die-6.png'})
if len(manifest['assets']) != 3:
    raise ValueError('未找到所需的骰盅、骰子和网格，停止导入')
(ROOT / 'docs/source-data/dice-assets.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('已提取骰盅、骰子原图、入口图标与骰子网格。下一步渲染六面图。')

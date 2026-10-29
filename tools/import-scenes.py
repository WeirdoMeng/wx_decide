#!/usr/bin/env python3
"""将场景原始响应转为离线小程序数据，不执行登录或业务鉴权。

python3 tools/import-scenes.py --scene-13010 <13010.txt> --scene-13011 <13011.txt> \
    --templates <主包 templates.json> [--download-covers]
后续也可直接读取 docs/source-data/ 中归档的响应重新生成。
"""
import argparse
import io
import json
from pathlib import Path
import re
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SUBTITLES = {
    'tossCoin': '抛一下，让硬币帮你决定',
    'passBalloon': '轮流传递，小心随机爆炸',
    'fingerSelection': '一起按住，随机选出一位',
    'truthDare': '说出真心话，勇敢大冒险',
    'numberBomb': '轮流报数，避开隐藏炸弹',
    'sharkTeeth': '每人一颗，小心鲨鱼咬到你',
    'snooker': '瞄准出杆，来一局斯诺克',
    'blackEight': '选好角度，挑战黑八',
}


def read_scene(path):
    source = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    if source.get('code') not in (0, 200) or not isinstance(source.get('data'), list):
        raise ValueError(f'{path}: 需要成功的完整场景响应')
    return source


def write_js(path, value, note):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('// ' + note + '\nmodule.exports = ' + json.dumps(value, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')


def collect_descriptions(node):
    children = node.get('children') or []
    if children:
        return [question for child in children for question in collect_descriptions(child)]
    description = str(node.get('description') or '').strip()
    return [description] if description else []


def build_questions(questions_scene, extras):
    questions = {'truths': [], 'dares': []}
    if not isinstance(extras, dict) or set(extras) != set(questions):
        raise ValueError('扩展题库必须包含 truths 和 dares')
    for category in questions_scene['data']:
        mode = {'真心话': 'truths', '大冒险': 'dares'}.get(category.get('name'))
        if mode:
            questions[mode].extend(collect_descriptions(category))
    seen = set()
    for mode in questions:
        # 原场景有相同叶子时按原顺序合并；扩展题目重复则报错，避免静默缩水。
        questions[mode] = list(dict.fromkeys(questions[mode]))
        if not isinstance(extras[mode], list):
            raise ValueError(mode + ': 扩展题目必须为数组')
        questions[mode].extend(extras[mode])
        for question in questions[mode]:
            if not isinstance(question, str) or not question.strip():
                raise ValueError(mode + ': 题目必须为非空文本')
            normalized = ''.join(char for char in unicodedata.normalize('NFKC', question)
                                 if not char.isspace() and unicodedata.category(char)[0] not in 'PS').casefold()
            if not normalized or normalized in seen:
                raise ValueError(mode + ': 重复题目: ' + question)
            seen.add(normalized)
        if len(questions[mode]) < 100:
            raise ValueError(mode + ': 题目不足100条')
    return questions


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scene-13010', default=ROOT / 'docs/source-data/13010.json')
    parser.add_argument('--scene-13011', default=ROOT / 'docs/source-data/13011.json')
    parser.add_argument('--templates', default=ROOT / 'docs/source-data/templates.json')
    parser.add_argument('--questions-extra', default=ROOT / 'docs/source-data/questions-extra.json')
    parser.add_argument('--questions-only', action='store_true', help='只重新生成题库，不改动入口、模板及原始响应归档')
    parser.add_argument('--download-covers', action='store_true', help='从响应的公开 coverImage 下载封面；需要 Pillow')
    args = parser.parse_args()
    questions_scene = read_scene(args.scene_13011)
    extras = json.loads(Path(args.questions_extra).read_text(encoding='utf-8-sig'))
    questions = build_questions(questions_scene, extras)
    write_js(ROOT / 'miniprogram/data/questions.js', questions, '来源：场景 13011 原题及 docs/source-data/questions-extra.json 原创扩展。由 tools/import-scenes.py 生成。')
    if args.questions_only:
        print(f'真心话 {len(questions["truths"])} 题；大冒险 {len(questions["dares"])} 题')
        return
    entries_scene = read_scene(args.scene_13010)
    templates = json.loads(Path(args.templates).read_text(encoding='utf-8-sig'))
    if not isinstance(templates, list) or not all(t.get('items') for t in templates):
        raise ValueError('模板数据为空或格式错误')
    entries = []
    seen = set()
    for item in entries_scene['data']:
        match = re.search(r'(?:^|[?&])route=([A-Za-z]+)', item.get('routeParamId') or item.get('routePath') or '')
        if not match or match.group(1) not in SUBTITLES:
            raise ValueError('未知游戏路由: ' + str(item.get('routeParamId')))
        key = match.group(1)
        if key in seen:
            raise ValueError('重复路由: ' + key)
        seen.add(key)
        # 台球白卡圆角依赖透明通道；转为 RGB/JPEG 会把透明角落变黑。
        transparent_cover = key in ('snooker', 'blackEight')
        cover = '/assets/party-entry-' + key + ('.png' if transparent_cover else '.jpg')
        entries.append({'key': key, 'title': item.get('name') or key, 'subtitle': SUBTITLES[key], 'cover': cover, 'sort': item.get('sort', 0)})
        if args.download_covers:
            from PIL import Image
            request = urllib.request.Request(item['coverImage'], headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=30) as response:
                image = Image.open(io.BytesIO(response.read())).convert('RGBA' if transparent_cover else 'RGB')
            image.thumbnail((600, 600))
            target = ROOT / 'miniprogram' / cover.lstrip('/')
            target.parent.mkdir(parents=True, exist_ok=True)
            if transparent_cover:
                image.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(target, format='PNG', optimize=True)
            else:
                image.save(target, format='JPEG', quality=78, optimize=True)
    archive = ROOT / 'docs/source-data'
    archive.mkdir(parents=True, exist_ok=True)
    for name, source in [('13010', entries_scene), ('13011', questions_scene), ('templates', templates)]:
        (archive / (name + '.json')).write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_js(ROOT / 'miniprogram/data/party-entries.js', entries, '来源：场景 13010。保留原响应数组顺序，封面内置本地。由 tools/import-scenes.py 生成。')
    write_js(ROOT / 'miniprogram/data/templates.js', templates, '来源：Flutter 小决定主包默认模板。由 tools/import-scenes.py 生成。')
    print(f'入口 {len(entries)} 项；真心话 {len(questions["truths"])} 题；大冒险 {len(questions["dares"])} 题；模板 {len(templates)} 项')

if __name__ == '__main__':
    run()

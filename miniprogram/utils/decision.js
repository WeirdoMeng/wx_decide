// 角度从顶部开始、顺时针为正，与 Canvas 的扇区布局保持同一真值源。
const TAU = Math.PI * 2;
function activeItems(items) { return (items || []).filter(item => !item.excluded); }
function weight(item) { const n = item.weight === undefined || item.weight === null ? 1 : Number(item.weight); return Number.isFinite(n) && n > 0 ? n : 0; }
function segments(items) {
  const total = items.reduce((sum, item) => sum + (weight(item) || 0.0001), 0);
  let angle = 0;
  return items.map(item => {
    const sweep = (weight(item) || 0.0001) / total * TAU;
    const result = { item, start: angle, sweep, center: angle + sweep / 2 };
    angle += sweep;
    return result;
  });
}
function pickWeighted(items, random = Math.random) {
  if (!items.length) return -1;
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  if (!total) return Math.min(items.length - 1, Math.floor(random() * items.length));
  let value = random() * total;
  for (let i = 0; i < items.length; i++) { value -= weight(items[i]); if (value < 0) return i; }
  return items.length - 1;
}
function targetRotation(items, index, rotation = 0, random = Math.random) {
  const segment = segments(items)[index];
  if (!segment) return rotation;
  const aligned = (TAU - segment.center) % TAU;
  const jitter = (random() - 0.5) * segment.sweep * 0.6;
  let target = rotation - rotation % TAU + TAU * 6 + aligned + jitter;
  if (target <= rotation + TAU) target += TAU;
  return target;
}
function integer(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}
function randomNumbers(min, max, count, repeat, random = Math.random) {
  const a = integer(min, 1, 0, 999999), b = integer(max, 100, 0, 999999);
  const lo = Math.min(a, b), hi = Math.max(a, b), span = hi - lo + 1;
  const size = integer(count, 1, 1, 100);
  if (!repeat && size > span) throw new Error(`不重复模式下，最多可抽取 ${span} 个数字`);
  // 稀疏 Fisher-Yates，不为 0~999999 构造百万项数组。
  const swapped = new Map(), result = [];
  for (let i = 0; i < size; i++) {
    if (repeat) { result.push(lo + Math.floor(random() * span)); continue; }
    const remaining = span - i, picked = Math.floor(random() * remaining);
    result.push(lo + (swapped.has(picked) ? swapped.get(picked) : picked));
    swapped.set(picked, swapped.has(remaining - 1) ? swapped.get(remaining - 1) : remaining - 1);
  }
  return result;
}
function validateList(title, items) {
  if (!String(title || '').trim()) return '请填写列表名称';
  if (!items || items.length < 2) return '至少添加 2 个选项';
  if (items.some(item => !String(item.text || '').trim())) return '请填写每个选项的内容';
  if (items.some(item => !Number.isFinite(Number(item.weight)) || Number(item.weight) < 0)) return '权重需为大于或等于 0 的数字';
  if (activeItems(items).length < 2) return '至少保留 2 个参与抽取的选项';
  return '';
}
module.exports = { TAU, activeItems, segments, pickWeighted, targetRotation, randomNumbers, validateList, integer };

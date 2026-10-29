const PREFIX = 'little-decision:v1:';
function read(key, fallback) {
  try { const value = wx.getStorageSync(PREFIX + key); return value === '' || value === undefined ? fallback : value; }
  catch (_) { return fallback; }
}
function write(key, value) {
  // 写入失败必须交给界面提示，不能将未保存的数据当作成功。
  wx.setStorageSync(PREFIX + key, value);
  return value;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function normalizeList(list) {
  return Object.assign({}, list, { items: (list.items || []).map((item, index) => Object.assign({ id: list.id + '-item-' + index, weight: 1, excluded: false }, item)) });
}
function getLists() {
  if (!read('seeded', false)) {
    const templates = require('../data/templates.js');
    write('lists', clone(templates.slice(0, 2)).map(item => normalizeList(Object.assign(item, { updatedAt: Date.now() }))));
    write('seeded', true);
  }
  const lists = read('lists', []);
  return Array.isArray(lists) ? clone(lists).map(normalizeList) : [];
}
function saveList(list) {
  const lists = getLists(), index = lists.findIndex(item => item.id === list.id);
  const value = Object.assign({}, list, { updatedAt: Date.now() });
  if (index < 0) lists.unshift(value); else lists[index] = value;
  write('lists', lists); write('selected', value.id);
  return value;
}
function deleteList(id) { const lists = getLists(); if (lists.length <= 1) throw new Error('至少保留一个列表'); write('lists', lists.filter(item => item.id !== id)); }
function getSettings() { return Object.assign({ sound: true, vibration: true }, read('settings', {})); }
function saveSettings(settings) { return write('settings', Object.assign(getSettings(), settings)); }
function feedback(type = 'light') {
  if (getSettings().vibration && wx.vibrateShort) wx.vibrateShort({ type, fail() {} });
}
module.exports = { read, write, clone, newId, getLists, saveList, deleteList, getSettings, saveSettings, feedback };

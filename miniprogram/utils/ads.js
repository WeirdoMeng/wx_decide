const config = require('../data/ad-config');
const storage = require('./storage');
const account = require('./account');

function createManager(options = {}) {
  const cfg = options.config || config, policy = cfg.policy;
  const now = options.now || Date.now, random = options.random || Math.random;
  const api = options.api || (() => typeof wx === 'undefined' ? {} : wx);
  const store = options.storage || storage;
  const isAdFree = options.isAdFree || account.isAdFree;
  const later = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
  let sessionActions = 0, sessionCount = 0, completed = 0, globalBusy = false;
  let saved = store.read('ads:v1', {});
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  saved.pools = saved.pools || {}; saved.units = saved.units || {}; saved.engagement = saved.engagement || {};
  // 操作计数每次打开重置，广告位轮换记录仍跨页面、跨打开保留。
  saved.opActions = 0;
  delete saved.retryAtAction;
  function pityDue(kind,placement) { return kind === 'interstitial' && !!(cfg.triggers && cfg.triggers[placement]) &&
    policy.pityActions > 0 && saved.opActions >= policy.pityActions; }
  function persist() { try { store.write('ads:v1', saved); } catch (_) {} }
  function day() { const d = new Date(now()); return [d.getFullYear(), d.getMonth()+1, d.getDate()].join('-'); }
  function today() { if (saved.day !== day()) { saved.day = day(); saved.count = 0; } }
  function log(type, detail) { if (options.log) options.log(type, detail); else console.info('[ads]', type, detail || ''); }
  function choose(type) {
    const ids = Array.from(new Set(cfg[type] || []));
    if (isAdFree() || !cfg.enabled || !ids.length) return '';
    const pool = saved.pools[type] || { bag: [], last: '' };
    let bag = Array.isArray(pool.bag) ? pool.bag.filter(id => ids.includes(id)) : [];
    if (!bag.length) {
      bag = ids.slice();
      for (let i = bag.length-1; i > 0; i--) { const j = Math.floor(random()*(i+1)); [bag[i],bag[j]] = [bag[j],bag[i]]; }
    }
    let index = bag.findIndex(id => (ids.length === 1 || id !== pool.last) &&
      (type !== 'interstitial' || ids.length === 1 || id !== saved.lastShown));
    // 若剩余袋子只剩上次展示的ID，重新选其它ID，避免失败请求让轮换卡住。
    if(index < 0){bag=ids.filter(id=>id!==pool.last&&id!==saved.lastShown);index=bag.length?Math.floor(random()*bag.length):-1;}
    if (index < 0) return '';
    const id = bag.splice(index,1)[0];
    saved.pools[type] = {bag,last:id}; persist();
    return id;
  }
  function blockedReason(kind, placement) {
    today();
    if (isAdFree()) return 'member-ad-free';
    if (!cfg.enabled) return 'disabled';
    if (typeof api()[kind === 'rewarded' ? 'createRewardedVideoAd' : 'createInterstitialAd'] !== 'function') return 'unsupported-api';
    if (globalBusy) return 'fullscreen-busy';
    if (kind === 'rewarded') return '';
    if (sessionActions < (policy.minActions || 3)) return 'min-actions';
    return '';
  }
  function controller(isActive, kind = 'interstitial') {
    let task = null, disposed = false;
    function play(done, request = {}) {
      if (disposed || !isActive() || task) return false;
      const blocked=blockedReason(kind,request.placement);
      if (blocked) { log(kind+'-skip',{placement:request.placement,reason:blocked,actions:saved.opActions,sessionActions});done({status:'unavailable'}); return; }
      const forced=pityDue(kind,request.placement),id=choose(kind);
      if (!id) { log(kind+'-skip',{placement:request.placement,reason:'no-available-unit',actions:saved.opActions,sessionActions});done({status:'unavailable'}); return; }
      globalBusy = true;
      const current = { id, instance:null, timer:null, shown:false, showing:false, done };
      task = current;
      log(kind+'-attempt',{id,placement:request.placement,forced,actions:saved.opActions,sessionActions});
      try { if(api().showLoading)api().showLoading({title:'正在准备广告',mask:true}); } catch (_) {}
      function hideLoading() { try { if(api().hideLoading)api().hideLoading(); } catch (_) {} }
      current.hideLoading = hideLoading;
      function valid() { return !disposed && task === current; }
      function cleanup() {
        hideLoading();
        if (current.timer !== null) cancel(current.timer);
        if (current.instance) {
          try {
            if (current.instance.offLoad) current.instance.offLoad(onLoad);
            if (current.instance.offError) current.instance.offError(onError);
            if (current.instance.offClose) current.instance.offClose(onClose);
            if (typeof current.instance.destroy === 'function') current.instance.destroy();
          } catch (_) {}
        }
      }
      current.cleanup = cleanup;
      function finish(status) {
        if (!valid()) return;
        task = null; globalBusy = false; cleanup();
        const callback = current.done; current.done = null;
        if (callback && isActive()) callback({status:status || 'closed'});
      }
      function shown() {
        if (!valid() || current.shown) return;
        current.shown = true;
        if (current.timer !== null) { cancel(current.timer); current.timer = null; }
        if (kind === 'rewarded') {
          saved.rewardTime = now();
        } else {
          today(); saved.count = (saved.count || 0)+1; sessionCount++;
          saved.lastTime = now(); saved.lastShown = id; saved.units[id] = now();
          saved.opActions=0;
          for(const placement of Object.keys(cfg.triggers || {}))if(placement!=='save')saved.engagement[placement]=0;
        }
        persist(); log(kind+'-show',{id,placement:request.placement,forced,sessionShown:sessionCount,dailyShown:saved.count,completedRounds:completed});
      }
      function onError(error) {
        if (!valid()) return;
        const code = Number(error && (error.errCode || error.code));
        // 平台频控只结束当前尝试，不自动重试，也不额外设置本地等待。
        saved.units[id] = now(); persist(); log(kind+'-error',{id,code,placement:request.placement,forced,actions:saved.opActions,sessionActions}); finish('error');
      }
      function onClose(result) { if (!valid()) return; if(!current.showing){finish('error');return;}shown(); log(kind+'-close',id); finish(kind==='rewarded'?(result && result.isEnded===true?'complete':'incomplete'):'closed'); }
      function onLoad() {
        if (!valid() || current.showing) return;
        if (!isActive()) { finish(); return; }
        current.showing = true;
        hideLoading();
        // show 已发起后只由成功、错误或关闭结束，不能超时后在原生广告下启动游戏。
        if (current.timer !== null) { cancel(current.timer); current.timer = null; }
        try { Promise.resolve(current.instance.show()).then(shown,onError); } catch (error) { onError(error); }
      }
      try {
        current.instance = kind==='rewarded' ? api().createRewardedVideoAd({adUnitId:id}) : api().createInterstitialAd({adUnitId:id});
        current.instance.onLoad(onLoad); current.instance.onError(onError); current.instance.onClose(onClose);
        current.timer = later(() => { log(kind+'-load-timeout',{id,placement:request.placement,forced,actions:saved.opActions,sessionActions}); finish('error'); },policy.loadTimeout);
        if(kind==='rewarded'&&typeof current.instance.load==='function')Promise.resolve(current.instance.load()).then(onLoad,onError);
      } catch (error) { onError(error); }
    }
    return {
      play,
      cancel() {
        if (!task) return;
        task.done = null;
        // 原生广告展示期间不销毁；后台返回后也不会自动开始下一局。
        if (!task.showing) this.disposeTask();
      },
      disposeTask() {
        if (!task) return;
        const old = task; task = null; globalBusy = false;
        if(old.cleanup)old.cleanup();
      },
      dispose() { disposed = true; this.disposeTask(); }
    };
  }
  function shouldOffer(placement, kind = 'interstitial') {
    const rule = cfg.triggers && cfg.triggers[placement];
    if (isAdFree() || !rule || !cfg.enabled) return false;
    const actions = (saved.engagement[placement] || 0)+1;
    saved.engagement[placement] = actions;
    if(kind==='interstitial'){saved.opActions++;sessionActions++;}
    persist();
    const forced=pityDue(kind,placement);
    const reason=blockedReason(kind,placement);
    if(reason){log(kind+'-decision',{placement,actions:saved.opActions,placementActions:actions,sessionActions,forced,reason});return false;}
    const hit=forced || random() < rule.probability;
    log(kind+'-decision',{placement,actions:saved.opActions,placementActions:actions,sessionActions,forced,reason:hit?(forced?'pity-hit':'random-hit'):'random-miss'});
    return hit;
  }
  return { choose, controller, shouldOffer, recordRound() { completed++; },
    startSession() { if(globalBusy)return false;sessionActions=0;sessionCount=0;completed=0;saved.opActions=0;for(const key of Object.keys(cfg.triggers || {}))if(key!=='save')saved.engagement[key]=0;persist();return true; },
    bannerEvent(type,id,error) { log('banner-'+type,{id,code:error && error.errCode}); } };
}
const manager = createManager();
module.exports = Object.assign(manager, {createManager});

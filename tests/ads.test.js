const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {createManager} = require('../miniprogram/utils/ads');
const production = require('../miniprogram/data/ad-config');
function fixture(saved) {
  let time = 1000, active = true, resumed = 0, timerId = 0;
  const timers = new Map(), instances = [], data = saved || {};
  const config = {enabled:true,interstitial:['a','b','c'],banner:['x','y','z'],triggers:{test:{minActions:3,probability:1}},policy:{minActions:3,pityActions:25,loadTimeout:40}};
  const api = {createInterstitialAd({adUnitId}) {
    const item={id:adUnitId,handlers:{},destroyed:false,shows:0,
      onLoad(fn){this.handlers.load=fn;},onError(fn){this.handlers.error=fn;},onClose(fn){this.handlers.close=fn;},
      offLoad(){},offError(){},offClose(){},destroy(){this.destroyed=true;},
      show(){this.shows++;return this.reject?Promise.reject(this.reject):Promise.resolve();}};
    instances.push(item);return item;
  }};
  const options = {config,api:()=>api,now:()=>time,random:()=>0.4,log(){},
    storage:{read:(key,fallback)=>data[key]?JSON.parse(JSON.stringify(data[key])):fallback,write:(key,value)=>{data[key]=JSON.parse(JSON.stringify(value));}},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}};
  const manager=createManager(options),controller=manager.controller(()=>active);
  return {manager,controller,instances,data,timers,options,config,api,
    advance(ms=101){time+=ms;},eligible(){const key=Object.keys(config.triggers).find(key=>key!=='save');for(let i=0;i<3;i++)manager.shouldOffer(key);},
    play(){return controller.play(()=>resumed++);},get resumed(){return resumed;},set active(value){active=value;}};
}
const flush = () => Promise.resolve();
test('用户广告配置分类隔离，8个插屏、7个Banner和5个激励ID无重复，普通视频未启用',()=>{
  assert.equal(production.interstitial.length,8);assert.equal(production.banner.length,7);assert.equal(production.rewarded.length,5);
  const ids=production.interstitial.concat(production.banner,production.rewarded);
  assert.equal(new Set(ids).size,20);ids.forEach(id=>assert.match(id,/^adunit-[a-f0-9]{16}$/));
  assert.deepEqual(production.video,[]);
});
test('每类随机袋整轮不重复，跨轮与重建管理器均避开上一广告位',()=>{
  const f=fixture();
  for(const type of ['banner','interstitial']){
    const first=Array.from({length:3},()=>f.manager.choose(type));assert.equal(new Set(first).size,3);
    const next=f.manager.choose(type);assert.notEqual(next,first[2]);
    const restored=createManager(f.options);assert.notEqual(restored.choose(type),next);
  }
});
test('所有入口共用本次打开计数，前2次不触发，第3次开始判断概率',()=>{
 const f=fixture();f.play();assert.equal(f.instances.length,0);
 assert.equal(f.manager.shouldOffer('test'),false);assert.equal(f.manager.shouldOffer('test'),false);f.play();assert.equal(f.instances.length,0);
 assert.equal(f.manager.shouldOffer('test'),true);f.play();assert.equal(f.instances.length,1);
});

test('广告加载后只显示一次，关闭才继续，成功次数只记一次并清理实例',async()=>{
  const f=fixture();f.eligible();f.play();const ad=f.instances[0];ad.handlers.load();ad.handlers.load();
  await flush();assert.equal(ad.shows,1);assert.equal(f.resumed,0);assert.equal(f.timers.size,0);
  ad.handlers.close();ad.handlers.close();await flush();assert.equal(f.resumed,1);assert.equal(ad.destroyed,true);
  assert.equal(f.data['ads:v1'].count,1);assert.equal(f.data['ads:v1'].lastShown,ad.id);
});
test('跨页面同时只展示一个，关闭后没有额外时间或局数等待',async()=>{
 const f=fixture();f.eligible();f.play();const other=f.manager.controller(()=>true);let continued=0;
 other.play(()=>continued++);assert.equal(continued,1);assert.equal(f.instances.length,1);
 f.instances[0].handlers.load();await flush();f.instances[0].handlers.close();
 other.play(()=>continued++);assert.equal(f.instances.length,2);assert.notEqual(f.instances[0].id,f.instances[1].id);
});

test('加载超时放行一次、销毁实例，迟到回调不能弹出广告',()=>{
  const f=fixture();f.eligible();f.play();const ad=f.instances[0];
  [...f.timers.values()].forEach(fn=>fn());assert.equal(f.resumed,1);assert.equal(ad.destroyed,true);
  ad.handlers.load();ad.handlers.close();assert.equal(ad.shows,0);assert.equal(f.resumed,1);
});
test('平台2002只结束本次尝试，不自动扫广告位，也不添加本地等待',()=>{
 const f=fixture();f.eligible();f.play();f.instances[0].handlers.error({errCode:2002});
 assert.equal(f.resumed,1);assert.equal(f.data['ads:v1'].count,0);assert.equal(f.instances.length,1);
 f.play();assert.equal(f.instances.length,2);assert.notEqual(f.instances[0].id,f.instances[1].id);
});

test('show拒绝放行、重复错误和关闭不会重复继续',async()=>{
  const f=fixture();f.eligible();f.play();const ad=f.instances[0];ad.reject={errCode:1004};ad.handlers.load();
  await flush();assert.equal(f.resumed,1);ad.handlers.error({errCode:1004});ad.handlers.close();assert.equal(f.resumed,1);
  assert.equal(f.data['ads:v1'].count,0);
});
test('加载时退后台或卸载，旧广告不会展示或恢复下一局',()=>{
  for(const action of ['cancel','dispose']){
    const f=fixture();f.eligible();f.play();const ad=f.instances[0];f.active=false;f.controller[action]();
    ad.handlers.load();ad.handlers.close();assert.equal(ad.shows,0);assert.equal(f.resumed,0);assert.equal(f.timers.size,0);
  }
});
test('原生广告展示时退后台不会销毁广告，关闭也不自动启动游戏',async()=>{
  const f=fixture();f.eligible();f.play();const ad=f.instances[0];ad.handlers.load();await flush();
  f.active=false;f.controller.cancel();assert.equal(ad.destroyed,false);f.active=true;
  assert.equal(f.play(),false);ad.handlers.close();assert.equal(f.resumed,0);assert.equal(ad.destroyed,true);
});
test('不存在本地展示间隔、单次启动和每日次数上限，旧缓存限制也不生效',async()=>{
 const f=fixture();f.eligible();f.config.policy.sessionLimit=0;f.config.policy.dailyLimit=0;f.config.policy.interval=999999;
 for(let i=0;i<4;i++){f.play();const ad=f.instances.at(-1);ad.handlers.load();await flush();ad.handlers.close();}
 assert.equal(f.instances.length,4);assert.equal(f.data['ads:v1'].count,4);
 for(const key of ['interval','unitCooldown','afterReward','sessionLimit','dailyLimit','retryActions'])assert.equal(Object.hasOwn(production.policy,key),false);
});

test('不支持广告API时正常继续，配置总开关也能关闭两种广告',()=>{
  const f=fixture();delete f.api.createInterstitialAd;f.eligible();f.play();assert.equal(f.resumed,1);
  f.config.enabled=false;assert.equal(f.manager.choose('banner'),'');
});
test('真实聚会页的Banner在加载失败后收起，重新进入才轮换，旧回调不影响新位',()=>{
  const file=path.resolve(__dirname,'../miniprogram/pages/party/index.js');const f=fixture();let definition;
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page(value){definition=value;},require(id){
    if(id.endsWith('/ads'))return f.manager;
    if(id.endsWith('/storage'))return{read:(key,fallback)=>key==='party:entrance-seen'?true:fallback,getSettings:()=>({})};
    if(id.endsWith('/layout'))return{metrics:()=>({scale:1,windowHeight:844,safeTop:44,navHeight:44})};
    return [];
  },wx:{},setTimeout,clearTimeout,console});
  const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),getTabBar(){},setData(value){Object.assign(this.data,value);}};
  page.onLoad();page.onShow();const first=page.data.bannerUnit;assert.ok(first);
  page.adError({currentTarget:{dataset:{unit:first}},detail:{errCode:1004}});assert.equal(page.data.bannerFailed,true);
  page.onHide();assert.equal(page.data.bannerUnit,'');page.onShow();assert.notEqual(page.data.bannerUnit,first);
  page.adError({currentTarget:{dataset:{unit:first}},detail:{}});assert.equal(page.data.bannerFailed,false);
  page.showSettings();assert.equal(page.data.settingsOpen,true);const previous=page.data.bannerUnit;page.closeSettings();assert.notEqual(page.data.bannerUnit,previous);
});
test('真实首页Banner复用轮换池，弹层时移除、返回轮换，旧广告回调不干扰新广告',()=>{
  const file=path.resolve(__dirname,'../miniprogram/pages/index/index.js');const f=fixture();let definition;
  const partyUnit=f.manager.choose('banner');
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page(value){definition=value;},require(id){
    if(id.endsWith('/ads'))return f.manager;
    if(id.endsWith('/storage.js'))return{getLists:()=>[{id:'first',title:'今天吃什么',items:[{text:'火锅'},{text:'烧烤'}]}],read:(key,fallback)=>fallback};
    if(id.endsWith('/layout.js'))return{metrics:()=>({})};
    if(id.endsWith('/sound.js'))return{createPlayer:()=>({destroy(){}})};
    if(id.endsWith('/decision.js'))return require('../miniprogram/utils/decision');
    return {};
  },wx:{showToast(){}},console});
  const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),getTabBar(){},setData(value){Object.assign(this.data,value);}};
  page.onLoad();page.onShow();const first=page.data.bannerUnit;assert.ok(first);assert.notEqual(first,partyUnit);
  page.openLists();assert.equal(page.data.listsOpen,true);assert.equal(page._bannerMounted,false);
  page.closeLists();const second=page.data.bannerUnit;assert.notEqual(second,first);assert.equal(page.data.listsOpen,false);
  page.adError({currentTarget:{dataset:{unit:first}},detail:{}});assert.equal(page.data.bannerFailed,false);
  page.adError({currentTarget:{dataset:{unit:second}},detail:{errCode:1004}});assert.equal(page.data.bannerFailed,true);
  page.onHide();assert.equal(page.data.bannerUnit,'');page.onShow();assert.notEqual(page.data.bannerUnit,second);assert.equal(page.data.bannerFailed,false);
  page.onUnload();assert.equal(page.data.bannerUnit,'');
});
test('Banner位置回归：首页标题后、名单前；聚会台球后、小游戏标题前',()=>{
  const root=path.resolve(__dirname,'../miniprogram/pages');
  const home=fs.readFileSync(path.join(root,'index/index.wxml'),'utf8');
  const party=fs.readFileSync(path.join(root,'party/index.wxml'),'utf8');
  assert.ok(home.indexOf('<original-nav')<home.indexOf('class="home-ad-slot"'));
  assert.ok(home.indexOf('class="home-ad-slot"')<home.indexOf('class="wheel-top"'));
  assert.ok(party.indexOf('class="billiards-banner"')<party.indexOf('class="party-ad-slot"'));
  assert.ok(party.indexOf('class="party-ad-slot"')<party.indexOf('class="games-section-title"'));
  assert.equal((home.match(/<ad\s/g)||[]).length,1);assert.equal((party.match(/<ad\s/g)||[]).length,1);
});
test('激励视频独立轮换，只认isEnded严格为true，关闭重复回调只结算一次',async()=>{
  const f=fixture();f.config.rewarded=['r1','r2','r3'];f.api.createRewardedVideoAd=f.api.createInterstitialAd;
  const controller=f.manager.controller(()=>true,'rewarded');const results=[],used=[];
  for(const response of [{isEnded:true},{isEnded:false},undefined]){
    controller.play(result=>results.push(result.status));const ad=f.instances.at(-1);used.push(ad.id);
    ad.handlers.load();await flush();ad.handlers.close(response);ad.handlers.close({isEnded:true});
  }
  assert.deepEqual(results,['complete','incomplete','incomplete']);assert.equal(new Set(used).size,3);
  assert.equal(f.data['ads:v1'].count,0);assert.ok(f.data['ads:v1'].rewardTime);
});
test('激励视频在未加载、加载错误或超时时绝不发完成奖励',()=>{
  for(const failure of ['early-close','error','timeout']){
    const f=fixture();f.config.rewarded=['r1'];f.api.createRewardedVideoAd=f.api.createInterstitialAd;
    const controller=f.manager.controller(()=>true,'rewarded');const results=[];
    controller.play(result=>results.push(result.status));const ad=f.instances[0];
    if(failure==='early-close')ad.handlers.close({isEnded:true});
    else if(failure==='error')ad.handlers.error({errCode:1004});
    else [...f.timers.values()].forEach(fn=>fn());
    ad.handlers.load();ad.handlers.close({isEnded:true});assert.deepEqual(results,['error']);assert.equal(ad.shows,0);
  }
});
test('保存50%随机，全部7个插屏入口从本次第3次起20%，前2次不触发',()=>{
 assert.equal(production.triggers.save.probability,.5);assert.equal(production.policy.pityActions,25);
 const f=fixture();f.config.triggers=production.triggers;f.api.createRewardedVideoAd=f.api.createInterstitialAd;
 for(const key of ['truth','wheel','coin','passBalloon','numberBomb','sharkTeeth','billiards']){
  assert.equal(production.triggers[key].probability,.20);
  const manager=createManager({...f.options,random:()=>.1});
  assert.equal(manager.shouldOffer(key),false);assert.equal(manager.shouldOffer(key),false);assert.equal(manager.shouldOffer(key),true);
 }
 const yes=createManager({...f.options,random:()=>.1});assert.equal(yes.shouldOffer('save','rewarded'),true);
 const no=createManager({...f.options,random:()=>.6});assert.equal(no.shouldOffer('save','rewarded'),false);
});

test('激励展示后无额外本地等待，激励不计入插屏操作次数',async()=>{
 const f=fixture();f.config.rewarded=['r1'];f.config.triggers=production.triggers;f.api.createRewardedVideoAd=f.api.createInterstitialAd;
 const reward=f.manager.controller(()=>true,'rewarded');reward.play(()=>{});const ad=f.instances[0];
 ad.handlers.load();await flush();ad.handlers.close({isEnded:true});f.play();assert.equal(f.instances.length,1);
 f.eligible();f.play();assert.equal(f.instances.length,2);
});

function pityFixture(saved) {
 const f=fixture(saved),logs=[];
 f.config.triggers=production.triggers;f.config.policy.pityActions=25;
 const options={...f.options,random:()=>.999,log:(type,detail)=>logs.push({type,detail})};
 return {...f,options,logs,manager:createManager(options)};
}
const operationEntries=['truth','wheel','coin','passBalloon','numberBomb','sharkTeeth','billiards'];
test('全部插屏入口共用25次兜底，连续随机落空时第25次仍创建一次插屏',async()=>{
  const f=pityFixture();
  for(let i=0;i<24;i++)assert.equal(f.manager.shouldOffer(operationEntries[i%operationEntries.length]),false);
  assert.equal(f.instances.length,0);assert.equal(f.manager.shouldOffer('truth'),true);
  const controller=f.manager.controller(()=>true);controller.play(()=>{},{placement:'truth'});
  assert.equal(f.instances.length,1);assert.equal(f.data['ads:v1'].opActions,25);
  assert.ok(f.logs.some(item=>item.type==='interstitial-attempt'&&item.detail.forced));
  const ad=f.instances[0];ad.handlers.load();await flush();ad.handlers.close();
  assert.equal(f.data['ads:v1'].opActions,0);assert.equal(f.data['ads:v1'].retryAtAction,undefined);
});
test('旧版时间和次数缓存不会阻止25次兜底展示',async()=>{
  const d=new Date(1000),day=[d.getFullYear(),d.getMonth()+1,d.getDate()].join('-');
  const f=pityFixture({'ads:v1':{day,count:9,lastTime:1000,rewardTime:1000,opActions:0,units:{a:1000,b:1000,c:1000}}});
  f.config.policy.sessionLimit=0;f.config.policy.dailyLimit=0;
  for(let i=0;i<24;i++)assert.equal(f.manager.shouldOffer('wheel'),false);
  assert.equal(f.manager.shouldOffer('wheel'),true);const controller=f.manager.controller(()=>true);
  controller.play(()=>{},{placement:'wheel'});assert.equal(f.instances.length,1);
  f.instances[0].handlers.load();await flush();f.instances[0].handlers.close();
  for(let i=0;i<24;i++)assert.equal(f.manager.shouldOffer('coin'),false);
  assert.equal(f.manager.shouldOffer('coin'),true);controller.play(()=>{},{placement:'coin'});
  assert.equal(f.instances.length,2);assert.notEqual(f.instances[1].id,f.instances[0].id);
});
test('保存激励不占插屏计数，不支持广告API时记录原因并放行',()=>{
  const f=pityFixture();f.config.rewarded=['r1'];f.api.createRewardedVideoAd=f.api.createInterstitialAd;
  for(let i=0;i<30;i++)f.manager.shouldOffer('save','rewarded');
  assert.equal(f.data['ads:v1'].opActions,0);
  delete f.api.createInterstitialAd;
  for(let i=0;i<25;i++)assert.equal(f.manager.shouldOffer('truth'),false);
  assert.ok(f.logs.some(item=>item.detail&&item.detail.reason==='unsupported-api'));
});
test('加载失败不清零兜底，本次不连扫广告位，下次有效操作可重新尝试',async()=>{
 const f=pityFixture();for(let i=0;i<25;i++)f.manager.shouldOffer('truth');
 const controller=f.manager.controller(()=>true);controller.play(()=>{},{placement:'truth'});f.instances[0].handlers.error({errCode:1004});
 assert.equal(f.data['ads:v1'].opActions,25);assert.equal(f.instances.length,1);
 assert.equal(f.manager.shouldOffer('wheel'),true);controller.play(()=>{},{placement:'wheel'});assert.equal(f.instances.length,2);
 f.instances[1].handlers.load();await flush();f.instances[1].handlers.close();assert.equal(f.data['ads:v1'].opActions,0);
});

test('全屏互斥拦住兜底，平台频控失败后不增加本地退避，保留兜底资格',()=>{
 const f=pityFixture();for(let i=0;i<25;i++)f.manager.shouldOffer('truth');const controller=f.manager.controller(()=>true);controller.play(()=>{},{placement:'truth'});
 assert.equal(f.manager.shouldOffer('wheel'),false);assert.ok(f.logs.some(item=>item.detail&&item.detail.reason==='fullscreen-busy'));
 f.instances[0].handlers.error({errCode:2002});assert.equal(f.instances.length,1);
 assert.equal(f.manager.shouldOffer('coin'),true);controller.play(()=>{},{placement:'coin'});assert.equal(f.instances.length,2);
 assert.ok(f.logs.some(item=>item.type==='interstitial-error'&&item.detail.code===2002));
});

test('跨玩法累计25次，重新打开从头计数，旧版操作缓存不跳过前2次',()=>{
 const f=pityFixture();for(let i=0;i<12;i++)f.manager.shouldOffer('truth');for(let i=0;i<12;i++)assert.equal(f.manager.shouldOffer('wheel'),false);
 assert.equal(f.manager.shouldOffer('coin'),true);assert.equal(f.manager.startSession(),true);
 assert.equal(f.manager.shouldOffer('coin'),false);assert.equal(f.manager.shouldOffer('truth'),false);assert.equal(f.data['ads:v1'].opActions,2);
 const legacy=pityFixture({'ads:v1':{opActions:100,engagement:{truth:100,wheel:100,save:100}}});
 assert.equal(legacy.manager.shouldOffer('coin'),false);assert.equal(legacy.manager.shouldOffer('wheel'),false);
});
test('前两次保护按本次打开共用，第3次20%边界准确，成功后不重复前两次保护',async()=>{
 const f=fixture();f.config.triggers=production.triggers;let roll=.20;
 const manager=createManager({...f.options,random:()=>roll});
 assert.equal(manager.shouldOffer('wheel'),false);assert.equal(manager.shouldOffer('coin'),false);
 assert.equal(manager.shouldOffer('truth'),false);roll=.199999;
 assert.equal(manager.shouldOffer('sharkTeeth'),true);
 const controller=manager.controller(()=>true);controller.play(()=>{},{placement:'sharkTeeth'});
 f.instances[0].handlers.load();await flush();f.instances[0].handlers.close();
 assert.equal(manager.shouldOffer('billiards'),true);controller.play(()=>{},{placement:'billiards'});assert.equal(f.instances.length,2);
});
test('广告展示期间App返回前台不重置计数，真正重新打开后前两次重新保护',async()=>{
 const f=pityFixture();for(let i=0;i<25;i++)f.manager.shouldOffer('wheel');
 const controller=f.manager.controller(()=>true);controller.play(()=>{},{placement:'wheel'});
 assert.equal(f.manager.startSession(),false);assert.equal(f.data['ads:v1'].opActions,25);
 f.instances[0].handlers.load();await flush();f.instances[0].handlers.close();
 assert.equal(f.manager.startSession(),true);assert.equal(f.manager.shouldOffer('truth'),false);assert.equal(f.manager.shouldOffer('coin'),false);
 assert.equal(f.data['ads:v1'].opActions,2);
});

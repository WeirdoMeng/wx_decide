const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const ROOT=path.resolve(__dirname,'..');
const MINI=path.join(ROOT,'miniprogram');
const manifest=JSON.parse(fs.readFileSync(path.join(MINI,'app.json'),'utf8'));
const routes=manifest.pages.concat((manifest.subPackages||[]).flatMap(pkg=>pkg.pages.map(page=>pkg.root+'/'+page)));
const components=['custom-tab-bar/index'].concat(fs.readdirSync(path.join(MINI,'components')).filter(name=>fs.existsSync(path.join(MINI,'components',name,'index.json'))).map(name=>'components/'+name+'/index'));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
function json(value){return JSON.parse(JSON.stringify(value));}
function fixture(){
 const storage=new Map(),timers=new Map(),navigations=[],toasts=[];let id=0;
 const canvas={width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{}}),requestAnimationFrame:fn=>{timers.set(++id,fn);return id;},cancelAnimationFrame:key=>timers.delete(key)};
 const wx={
  getStorageSync:key=>storage.get(key)||'',setStorageSync:(key,value)=>storage.set(key,json(value)),
  getWindowInfo:()=>({pixelRatio:2,windowWidth:375,windowHeight:812}),getSystemInfoSync:()=>({pixelRatio:2,windowWidth:375,windowHeight:812}),
  showToast:options=>toasts.push(options),showModal(){},showActionSheet(){},setNavigationBarTitle(){},vibrateShort(){},
  navigateTo:options=>navigations.push(options),switchTab:options=>navigations.push(options),navigateBack(){},
  createInnerAudioContext:()=>({stop(){},play(){},destroy(){},onError(){}}),
  createSelectorQuery(){let selector='',rectCb;return{in(){return this;},select(value){selector=value;return this;},fields(){return this;},boundingClientRect(cb){rectCb=cb;return this;},exec(cb){if(rectCb)rectCb({left:0,top:0,width:375,height:400});if(cb)cb(selector==='#wheel'?[{node:canvas,width:330,height:330}]:[]);}};}
 };
 global.wx=wx;
 return {wx,timers,navigations,toasts,canvas,timerId:0};
}
function definition(route,env=fixture(),kind='Page'){
 const file=path.join(MINI,route+'.js');let output;
 const context={require:createRequire(file),wx:env.wx,console,Date,Math,Map,Set,Array,Object,Number,String,Boolean,JSON,
  Page:value=>{output=value;},Component:value=>{output=value;},getCurrentPages:()=>env.currentPages||[],
  setTimeout:fn=>{env.timers.set(++env.timerId,fn);return env.timerId;},clearTimeout:key=>env.timers.delete(key),
  setInterval:fn=>{env.timers.set(++env.timerId,fn);return env.timerId;},clearInterval:key=>env.timers.delete(key)};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 assert.ok(output,route+' exports '+kind);
 const instance=Object.assign({},output,kind==='Component'?output.methods:{},{route,data:json(output.data||{}),getTabBar:()=>({setData(){}}),getOpenerEventChannel:()=>({emit(){}}),setData(updates){
  for(const [key,value]of Object.entries(updates)){
   const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.');let target=this.data;
   while(parts.length>1){const part=parts.shift();if(!target[part])target[part]={};target=target[part];}target[parts[0]]=value;
  }
 }});
 return {instance,env};
}

test('全部注册页及自定义Tab四件套存在，分包和Tab路由有效',()=>{
 for(const route of routes.concat(components))for(const ext of ['js','json','wxml','wxss'])assert.ok(fs.existsSync(path.join(MINI,route+'.'+ext)),route+'.'+ext);
 for(const tab of manifest.tabBar.list)assert.ok(routes.includes(tab.pagePath));
 for(const file of files(MINI).filter(file=>file.endsWith('.js')&&!file.endsWith('renderer.js')&&!file.endsWith('core.js'))){
  const source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/['"]\/(pages|billiards\/pages)\/([\w/-]+)(?:\?[^'"]*)?['"]/g))assert.ok(routes.includes(match[1]+'/'+match[2]),file+': '+match[0]);
 }
});
test('全部WXML事件处理器存在，wx:if/elif必须绑定表达式',()=>{
 for(const route of routes.concat(components)){
  const {instance}=definition(route,fixture(),components.includes(route)?'Component':'Page');
  const source=fs.readFileSync(path.join(MINI,route+'.wxml'),'utf8');
  for(const match of source.matchAll(/\b(?:bind|catch):?[\w]+\s*=\s*["']([\w$]+)["']/g))assert.equal(typeof instance[match[1]],'function',route+' handler '+match[1]);
  for(const match of source.matchAll(/\bwx:(?:if|elif)\s*=\s*"([^"]*)"/g))assert.ok(match[1].startsWith('{{')&&match[1].endsWith('}}'),route+' unbound condition '+match[1]);
 }
});
test('所有页面执行基础生命周期，退出后不残留计时器',()=>{
 const cases=routes.flatMap(route=>route==='pages/game/index'?['sharkTeeth','numberBomb','truthDare','passBalloon'].map(type=>({route,options:{type}})):route==='billiards/pages/table/index'?['eight','snooker'].map(mode=>({route,options:{mode}})):[{route,options:{}}]);
 for(const {route,options}of cases){
  const {instance,env}=definition(route);
  for(const lifecycle of ['onLoad','onShow','onReady'])if(instance[lifecycle])instance[lifecycle](options);
  if(route==='pages/index/index')assert.equal(instance.data.ready,true);
  if(route==='billiards/pages/table/index')assert.equal(instance.data.ready,false,'Node fixture tests missing Canvas fallback, not WebGL rendering');
  for(const lifecycle of ['onHide','onUnload'])if(instance[lifecycle])instance[lifecycle]();
  assert.equal(env.timers.size,0,route+' left timers');
 }
});
test('场景13010入口数量、顺序、标题保真且各入口都可导航',()=>{
 const raw=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/source-data/13010.json'),'utf8')).data;
 const entries=require('../miniprogram/data/party-entries');
 assert.equal(entries.length,raw.length);
 entries.forEach((entry,index)=>{
  const original=raw[index];const key=(original.routeParamId||original.routePath).match(/(?:^|[?&])route=([A-Za-z]+)/)[1];
  assert.equal(entry.key,key);assert.equal(entry.title,original.name);assert.equal(entry.sort,original.sort);
  assert.ok(fs.existsSync(path.join(MINI,entry.cover)),entry.cover);
 });
 const {instance,env}=definition('pages/party/index');instance.onLoad();instance.onShow();
 for(const entry of entries){instance.play({currentTarget:{dataset:{key:entry.key}}});if(instance.data.introShow)instance.confirmIntro();}
 assert.equal(env.navigations.length,entries.length);for(const nav of env.navigations)assert.ok(routes.includes(nav.url.slice(1).split('?')[0]),nav.url);instance.onHide();assert.equal(env.timers.size,0);
});
test('场景13011原题保留，扩展题库每类至少100条且无重复；模板保持原JSON',()=>{
 const source=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/source-data/13011.json'),'utf8')).data;
 const extras=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/source-data/questions-extra.json'),'utf8'));
 const actual=require('../miniprogram/data/questions');
 const normalized=[];
 function leaves(node){if(node.children&&node.children.length)return node.children.flatMap(leaves);return node.description?[String(node.description).trim()]:[];}
 for(const [name,key]of [['真心话','truths'],['大冒险','dares']]){
  const original=[...new Set(source.filter(item=>item.name===name).flatMap(leaves))];
  assert.deepEqual(actual[key],original.concat(extras[key]));assert.ok(actual[key].length>=100);
  actual[key].forEach(question=>{assert.equal(typeof question,'string');assert.ok(question.trim());normalized.push(question.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu,'').toLowerCase());});
 }
 assert.equal(new Set(normalized).size,normalized.length);
 assert.deepEqual(require('../miniprogram/data/templates'),JSON.parse(fs.readFileSync(path.join(ROOT,'docs/source-data/templates.json'),'utf8')));
});
test('本地图片音频完整，登录支付由账户模块负责且仅广告模块可创建插屏',()=>{
 for(const file of files(MINI).filter(file=>/\.(wxml|wxss|js)$/.test(file)&&!/(renderer|core)\.js$/.test(file))){
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/\bwx\.(?:request|login|requestPayment|authorize|getUserProfile|createRewardedVideoAd)\s*\(|\bwx\.cloud\b/,file);
  if(!file.endsWith(path.join('utils','ads.js')))assert.doesNotMatch(source,/\.createInterstitialAd\s*\(/,file);
  const executableLines=source.split('\n').filter(line=>!/^\s*\/\//.test(line)).join('\n');
  assert.doesNotMatch(executableLines,/https?:\/\//,file);
  assert.doesNotMatch(source,/ensureMember|isVip|startToVip/,file);
  const clean=source.replace(/\/\/[^\n]*/g,'');
  for(const match of clean.matchAll(/["'](\/(?:assets|images|billiards\/assets)\/[^"'{}+]+\.(?:png|jpg|jpeg|webp|svg|wav|mp3))["']/g))assert.ok(fs.existsSync(path.join(MINI,match[1])),file+': '+match[1]);
 }
 for(let skin=1;skin<=5;skin++)for(const side of ['heads','tails'])assert.ok(fs.existsSync(path.join(MINI,`assets/original/coin${skin}_${side}.png`)));
 for(const name of ['start','burst','inflate','bite','card','tick','finish','safe'])assert.ok(fs.existsSync(path.join(MINI,`images/party-game/party_sound_${name}.wav`)));
 for(const name of ['cue','impact','cushion','pocket'])assert.ok(fs.existsSync(path.join(MINI,`billiards/assets/${name}.wav`)));
 for(const name of ['shark_game_open','shark_game_bite','balloon_play_character','party_intro_number_bomb','truth_dare_heart','truth_dare_star'])assert.ok(fs.existsSync(path.join(MINI,`assets/original/party/${name}.png`)));
});
test('转盘转动中拦截Tab切换，结束后恢复导航',()=>{
 const env=fixture();env.currentPages=[{route:'pages/index/index',data:{spinning:true}}];
 const {instance}=definition('custom-tab-bar/index',env,'Component');
 instance.switchTab({currentTarget:{dataset:{index:1}}});assert.equal(env.navigations.length,0);assert.equal(env.toasts[0].title,'转盘转动中，请稍候');
 env.currentPages[0].data.spinning=false;instance.switchTab({currentTarget:{dataset:{index:1}}});assert.equal(env.navigations[0].url,'/pages/party/index');
 instance.switchTab({currentTarget:{dataset:{index:0}}});assert.equal(env.navigations.length,1,'current Tab ignored');
});

test('恢复我的页第三项Tab且聚会声音震动设置仍可保存',()=>{
 assert.deepEqual(manifest.tabBar.list.map(item=>item.pagePath),['pages/index/index','pages/party/index','pages/mine/index']);
 assert.equal(routes.includes('pages/mine/index'),true);assert.equal(fs.existsSync(path.join(MINI,'pages/mine')),true);
 const tab=definition('custom-tab-bar/index',fixture(),'Component').instance;
 assert.deepEqual(json(tab.data.tabs.map(item=>item.path)),['/pages/index/index','/pages/party/index','/pages/mine/index']);
 const {instance,env}=definition('pages/party/index');instance.onLoad();instance.onShow();instance.showSettings();
 assert.equal(instance.data.settingsOpen,true);const before=instance.data.settings.sound;
 instance.toggleSetting({currentTarget:{dataset:{key:'sound'}}});assert.equal(instance.data.settings.sound,!before);
 instance.toggleSetting({currentTarget:{dataset:{key:'vibration'}}});assert.equal(instance.data.settings.vibration,false);
 const stored=require('../miniprogram/utils/storage').getSettings();assert.equal(stored.sound,!before);assert.equal(stored.vibration,false);
 instance.onHide();assert.equal(env.timers.size,0);
});

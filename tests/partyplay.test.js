const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const rules=require('../miniprogram/partyplay/rules'),words=require('../miniprogram/partyplay/words');
function fixture(page,options={},settings={}){
 let definition,now=10000,serial=0,callback=null;const timers=new Map(),values=new Map(),ads=[],audio=[],modals=[],toasts=[];
 const store={read:(key,fallback)=>values.has(key)?values.get(key):fallback,write:(key,value)=>values.set(key,value),feedback(){}};
 const wx={getPerformance:()=>({now:()=>now}),showModal(options){modals.push(options);},showToast(options){toasts.push(options);},navigateBack(){},switchTab(){}};
 const manager={shouldOffer(key){ads.push(key);return !!settings.offer;},controller:()=>({play(fn){callback=fn;},cancel(){callback=null;},dispose(){callback=null;}})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/partyplay/pages/'+page+'/index.js'),'utf8'),{Page:value=>definition=value,require:name=>name.endsWith('/storage')?store:name.endsWith('/layout')?{metrics:()=>({headerHeight:44})}:name.endsWith('/ads')?manager:name.endsWith('/audio')?{createAudio:()=>({play:type=>audio.push(type),stop(){}})}:name.endsWith('/words')?words:rules,wx,Date:{now:()=>now},console,setInterval(fn){timers.set(++serial,fn);return serial;},clearInterval(id){timers.delete(id);}});
 const instance={...definition,data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);}};instance.onLoad(options);instance.onShow();
 return{page:instance,values,timers,ads,audio,modals,toasts,advance(ms){now+=ms;for(const fn of [...timers.values()])fn();},closeAd(){if(callback){const fn=callback;callback=null;fn();}}};
}
const event=(field,value)=>({currentTarget:{dataset:{field,value}}});
test('两款独立词库各六类300条，名词描述和动作表演分开，无重复且优先未见',()=>{
 const all=[];for(const mode of ['heads','charades']){const pool=words.pool('mixed',mode);assert.equal(pool.length,300);assert.equal(new Set(pool.map(item=>item.word)).size,300);all.push(...pool.map(item=>item.word));
  for(const category of words.categoriesFor(mode)){assert.equal(category.words.length,50);const seen=category.words.slice(0,10),deck=rules.deck(category.key,seen,()=>.3,mode);assert.equal(deck.length,50);assert.ok(deck.slice(0,40).every(item=>!seen.includes(item.word)));assert.equal(new Set(deck.map(item=>item.word)).size,50);}}
 assert.equal(new Set(all).size,600);assert.ok(words.pool('mixed','heads').some(item=>item.word==='企鹅'));assert.ok(words.pool('mixed','charades').some(item=>item.word==='企鹅走路'));
});
test('头顶猜词直接按钮答题，暂停遮词并冻结时间，继续保留同一题和分数',()=>{
 const h=fixture('words'),p=h.page;p.start();assert.equal(p.data.phase,'prepare');h.advance(3000);assert.equal(p.data.phase,'playing');
 const first=p.data.word;p.correct();assert.equal(p.data.correct,1);assert.notEqual(p.data.word,first);const current=p.data.word;h.advance(1000);p.pause();assert.equal(p.data.word,'');assert.equal(p.data.phase,'paused');assert.equal(h.timers.size,0);
 h.advance(90000);p.resume();assert.equal(p.data.phase,'playing');assert.equal(p.data.word,current);h.advance(59000);assert.equal(p.data.phase,'result');assert.equal(p.data.correct,1);assert.equal(h.timers.size,0);
});
test('猜词无需传感器，后台取消准备或暂停当前题，不自动续玩，卸载清定时器',()=>{
 const h=fixture('words'),p=h.page;p.start();h.advance(3000);assert.equal(p.data.phase,'playing');assert.equal(p.enableFlip,undefined);assert.equal(p.undo,undefined);p.onHide();assert.equal(p.data.phase,'paused');assert.equal(h.timers.size,0);p.onShow();assert.equal(p.data.phase,'paused');p.resume();assert.equal(p.data.phase,'playing');p.onUnload();assert.equal(h.timers.size,0);
 const preparing=fixture('words');preparing.page.start();preparing.page.onHide();assert.equal(preparing.page.data.phase,'waiting');assert.equal(preparing.timers.size,0);
});
test('你比我猜按队轮流，同场无重复，总排名与动作词库正确',()=>{
 const h=fixture('words',{mode:'charades'}),p=h.page;p.toggleGrouped();p.choose(event('rounds',1));p.start();h.advance(3000);const first=p.data.word;p.correct();h.advance(400);p.skip();assert.equal(p.data.skipped,1);p.pause();p.finishRound();assert.equal(p.data.final,false);assert.equal(p.data.correct,1);
 p.nextTeam();assert.equal(p.data.phase,'waiting');assert.equal(h.timers.size,0);p.resume();h.advance(3000);assert.notEqual(p.data.word,first);p.correct();h.advance(400);p.correct();h.advance(60000);assert.equal(p.data.final,true);assert.equal(p.data.ranking[0].score,2);assert.equal(p.data.ranking[1].score,1);assert.equal(p.data.matchRounds.length,2);assert.ok(words.pool('mixed','charades').some(item=>item.word===first));assert.equal(h.values.has('party:word-seen:charades'),true);assert.equal(h.values.has('party:word-seen:heads'),false);
 assert.equal(h.ads.length,0);p.again();assert.deepEqual(h.ads,['charadesReplay']);
});
test('猜词过期作答不加分，广告等待期间防连点，后台取消后不自动开局',()=>{
 const h=fixture('words',{mode:'charades'},{offer:true}),p=h.page;p.start();h.advance(3000);h.advance(60000);p.correct();assert.equal(p.data.correct,0);p.again();p.again();assert.equal(h.ads.length,1);assert.equal(p.data.adPending,true);p.onHide();h.closeAd();p.onShow();assert.equal(p.data.phase,'result');assert.equal(p.data.adPending,false);
});
test('十秒挑战隐藏读秒、按真实经过时间算误差，并保留各目标最佳成绩',()=>{
 const h=fixture('timing'),p=h.page;p.startMatch();p.press();h.advance(1100);assert.equal(p.data.clock,'···');assert.equal(h.audio.length,0);h.advance(9130);p.press();assert.equal(p.data.elapsedText,'10.230');assert.equal(p.data.errorText,'0.230');assert.equal(p.data.direction,'超时按停');assert.equal(p.data.isBest,true);assert.equal(p.data.final,true);assert.ok(Math.abs(h.values.get('party:timing-best:10')-230)<.001);
 p.again();p.press();h.advance(9800);p.press();assert.equal(p.data.direction,'提前按停');assert.equal(p.data.errorText,'0.200');assert.equal(p.data.best,'0.200');
});
test('多人十秒挑战按轮流和平均误差排名，同显示精度误差并列',()=>{
 const h=fixture('timing'),p=h.page;p.toggleMulti();p.choose(event('rounds',3));p.startMatch();
 const durations=[10100,10300,9900,9700,10100,10300];
 for(let i=0;i<durations.length;i++){p.press();h.advance(durations[i]);p.press();if(i<durations.length-1){assert.equal(p.data.final,false);p.next();}}
 assert.equal(p.data.final,true);assert.equal(p.data.ranking.length,2);assert.equal(p.data.ranking[0].player,0);assert.equal(p.data.ranking[0].errorText,'0.100');assert.equal(p.data.ranking[1].errorText,'0.300');assert.equal(h.ads.length,0);
 const tied=rules.rankTiming([{player:0,error:-101.1},{player:1,error:101.4}],2,1);assert.deepEqual(tied.map(item=>item.rank),[1,1]);
});
test('计时中退后台或超时作废，不更新成绩，重试保持当前玩家，卸载清定时器',()=>{
 const h=fixture('timing'),p=h.page;p.toggleMulti();p.startMatch();p.press();h.advance(1000);p.onHide();assert.equal(p.data.phase,'invalid');assert.equal(p.data.attempts.length,0);p.onShow();assert.equal(p.data.phase,'invalid');p.retry();assert.match(p.data.turnLabel,/玩家 1/);p.press();h.advance(60001);assert.equal(p.data.phase,'invalid');assert.equal(p.data.attempts.length,0);p.onUnload();assert.equal(h.timers.size,0);
});
test('聚会卡片保留摇骰子首位，三个新入口路由正确',()=>{
 let page;const navigations=[];vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/party/index'),'utf8'),{Page:value=>page=value,require:name=>name.endsWith('party-entries')?require('../miniprogram/data/party-entries'):name.endsWith('/storage')?{read:()=>true}:{},wx:{navigateTo:value=>navigations.push(value)}});
 assert.deepEqual(Array.from(page.data.games.slice(0,4),item=>item.key),['dice','headsUp','tenSeconds','charades']);
 const instance={...page,setData(){},_syncTabbar(){}};for(const key of ['headsUp','tenSeconds','charades'])instance.play({currentTarget:{dataset:{key}}});assert.deepEqual(navigations.map(item=>item.url),['/partyplay/pages/words/index?mode=heads','/partyplay/pages/timing/index','/partyplay/pages/words/index?mode=charades']);
});

test('自定义时长弹窗验证1–300秒整数，取消和迟到回调不会修改设置',()=>{
 const h=fixture('timing'),p=h.page;
 for(const content of ['', 'abc','0','301','1.5','-2']){p.customDuration();h.modals.at(-1).success({confirm:true,content});assert.equal(p.data.target,10);}
 assert.equal(h.toasts.length,6);p.customDuration();h.modals.at(-1).success({confirm:false,content:'100'});assert.equal(p.data.target,10);
 p.customDuration();h.modals.at(-1).success({confirm:true,content:'120'});assert.equal(p.data.target,120);assert.equal(p.data.customTarget,true);p.startMatch();p.press();h.advance(120000);assert.equal(p.data.phase,'running');p.press();assert.equal(p.data.elapsedText,'120.000');assert.equal(p.data.direction,'正中目标');
 p.settings();p.customDuration();p.onHide();h.modals.at(-1).success({confirm:true,content:'30'});assert.equal(p.data.target,120);p.onShow();p.choose(event('target',5));assert.equal(p.data.customTarget,false);assert.equal(p.data.target,5);
});
test('两款结算明细按4条分页，排名和逐轮/逐次记录切换不丢数据',()=>{
 const h=fixture('words',{mode:'charades'}),p=h.page;p.setData({phase:'result',history:Array.from({length:11},(_,i)=>({word:'题目'+i,label:'答对',status:'correct'}))});p._updateDetails();assert.equal(p.data.detailRows.length,4);assert.equal(p.data.detailPages,3);p.detailPage({currentTarget:{dataset:{delta:1}}});assert.equal(p.data.detailRows[0].title,'题目4');p.detailPage({currentTarget:{dataset:{delta:1}}});assert.equal(p.data.detailRows.length,3);p.detailPage({currentTarget:{dataset:{delta:1}}});assert.equal(p.data.detailPage,2);
 const t=fixture('timing').page;t.setData({phase:'result',attempts:Array.from({length:24},(_,i)=>({key:i,name:'玩家 '+i,elapsedText:'10.00',errorText:'0.00'}))});t.detailTab({currentTarget:{dataset:{tab:'attempts'}}});assert.equal(t.data.detailPages,6);t.detailPage({currentTarget:{dataset:{delta:1}}});assert.equal(t.data.detailRows[0].key,4);
});

test('1秒和2秒目标开始即隐藏，3秒目标在0.6秒隐藏，不再等固定1秒',()=>{
 for(const target of [1,2]){const h=fixture('timing'),p=h.page;p.customDuration();h.modals.at(-1).success({confirm:true,content:String(target)});p.startMatch();p.press();assert.equal(p.data.clockHidden,true);assert.equal(p.data.clock,'···');h.advance(target*1000-1);p.press();assert.equal(p.data.differenceText,'提前 0.001 秒按停');}
 const h=fixture('timing'),p=h.page;p.customDuration();h.modals.at(-1).success({confirm:true,content:'3'});p.startMatch();p.press();assert.equal(p.data.clockHidden,false);h.advance(599);assert.equal(p.data.clock,'00:00.599');h.advance(1);assert.equal(p.data.clockHidden,true);
});
test('数字时钟显示分秒和三位毫秒，结算措辞明确表示提前按停或超出目标',()=>{
 assert.deepEqual(rules.timingClock(10230),{minutes:'00',seconds:'10',milliseconds:'230',text:'00:10.230'});assert.equal(rules.timingClock(59999.6).text,'01:00.000');assert.equal(rules.timingClock(120001).text,'02:00.001');
 for(const [duration,text,milliseconds]of [[10230,'超出目标 0.230 秒','230'],[9770,'提前 0.230 秒按停','770'],[10000,'正好命中目标','000']]){const h=fixture('timing'),p=h.page;p.startMatch();p.press();h.advance(duration);p.press();assert.equal(p.data.differenceText,text);assert.equal(p.data.resultMillis,milliseconds);}
});

test('各玩法只展示自己的分类，跨玩法分类不可选择，已见记录独立',()=>{
 const head=fixture('words').page,char=fixture('words',{mode:'charades'}).page;assert.ok(head.data.categories.some(item=>item.title==='地名景点'));assert.ok(char.data.categories.some(item=>item.title==='职业表演'));
 head.choose(event('category','sportsAct'));assert.equal(head.data.category,'mixed');char.choose(event('category','movies'));assert.equal(char.data.category,'mixed');
});

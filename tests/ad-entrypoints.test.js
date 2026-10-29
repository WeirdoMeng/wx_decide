const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function pageFixture(name,{offer=true,storageFailure=false}={}){
  let definition,close,offerCalls=0,requests=0,saves=0,backs=0,emits=0,cancels=0,clock=1000;
  const timers=new Map(),frames=new Map(),toasts=[];let seq=0;
  const list={id:'one',title:'晚饭',type:'wheel',items:[{id:'a',text:'火锅',weight:3,colorValue:0xff112233},{id:'b',text:'烧烤',weight:0,excluded:true}]};
  if(name==='index')list.items[1].excluded=false;
  const saved=[];
  const store={newId:()=> 'new',clone:value=>JSON.parse(JSON.stringify(value)),getLists:()=>[list],read:(key,fallback)=>fallback,getSettings:()=>({sound:false,vibration:false}),feedback(){},write(){},saveList(value){saves++;if(storageFailure)throw Error('disk full');saved.push(value);}};
  const ad={shouldOffer(){offerCalls++;return offer;},choose:()=>'',bannerEvent(){},recordRound(){},controller(active,kind){return{play(done,request){requests++;close=done;this.kind=kind;this.request=request;},cancel(){cancels++;},dispose(){cancels++;}};}};
  const file=path.resolve(__dirname,'../miniprogram/pages/'+name+'/index.js');
  const wx={setNavigationBarTitle(){},navigateBack(){backs++;},showToast(value){toasts.push(value.title);}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page(value){definition=value;},require(id){
    if(/\/ads$/.test(id))return ad;
    if(/\/storage(?:\.js)?$/.test(id))return store;
    if(/\/sound(?:\.js)?$/.test(id))return{createPlayer:()=>({play(){},destroy(){}})};
    if(/\/layout(?:\.js)?$/.test(id))return{metrics:()=>({scale:1,safeTop:24,navHeight:44,windowHeight:844,heightScale:1})};
    return require(path.resolve(path.dirname(file),id));
  },wx,Date:class extends Date{static now(){return clock;}},Math,console,
    setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);},setInterval(fn){timers.set(++seq,fn);return seq;},clearInterval(id){timers.delete(id);}});
  const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(value,callback){
    for(const [key,item] of Object.entries(value)){const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.');let target=this.data;while(parts.length>1)target=target[parts.shift()];target[parts[0]]=item;}
    if(callback)callback();},getTabBar(){},getOpenerEventChannel:()=>({emit(){emits++;}})};
  page.onLoad(name==='game'?{type:'truthDare'}:{id:'one'});
  if(name==='index'){page.onShow();page.canvas={requestAnimationFrame(fn){frames.set(++seq,fn);return seq;},cancelAnimationFrame(id){frames.delete(id);}};page.draw=()=>{};}
  return{page,store,ad,timers,frames,toasts,saved,get requests(){return requests;},get saves(){return saves;},get backs(){return backs;},get emits(){return emits;},get offerCalls(){return offerCalls;},close(result){close(result);},tick(){clock+=1000;const queue=[...timers.values()];timers.clear();queue.forEach(fn=>fn());},setStorageFailure(value){storageFailure=value;}};
}
test('编辑保存未命中广告立即保存并回传，保留权重、颜色及排除字段',()=>{
  const f=pageFixture('list-edit',{offer:false});f.page.data.title='修改';f.page.save();assert.equal(f.requests,0);assert.equal(f.saves,1);assert.equal(f.backs,1);assert.equal(f.emits,1);
  assert.equal(f.saved[0].items[0].weight,3);assert.equal(f.saved[0].items[0].colorValue,0xff112233);assert.equal(f.saved[0].items[1].excluded,true);
});
test('编辑保存命中激励时，校验在先、完整观看后只保存一次',()=>{
  const f=pageFixture('list-edit');f.page.data.title='';f.page.save();assert.equal(f.offerCalls,0);
  f.page.data.title='修改';f.page.save();f.page.save();assert.equal(f.requests,1);assert.equal(f.saves,0);assert.equal(f.page.data.saving,true);
  f.close({status:'complete'});assert.equal(f.saves,1);assert.equal(f.backs,1);assert.equal(f.emits,1);
});
test('激励提前关闭或无广告保留编辑内容，不保存不返回，允许再次操作',()=>{
  for(const status of ['incomplete','error','unavailable']){
    const f=pageFixture('list-edit');f.page.data.title='未保存草稿';f.page.save();f.close({status});
    assert.equal(f.saves,0);assert.equal(f.backs,0);assert.equal(f.page.data.title,'未保存草稿');assert.equal(f.page.data.saving,false);assert.equal(f.toasts.length,1);
  }
});
test('完整观看后磁盘失败，同一份草稿重试无需再看视频；退后台不迟到保存',()=>{
  const f=pageFixture('list-edit',{storageFailure:true});f.page.save();f.close({status:'complete'});assert.equal(f.saves,1);assert.equal(f.page.data.saving,false);
  f.setStorageFailure(false);f.page.save();assert.equal(f.requests,1);assert.equal(f.saves,2);assert.equal(f.backs,1);
  const gone=pageFixture('list-edit');gone.page.save();gone.page.onHide();gone.close({status:'complete'});assert.equal(gone.saves,0);
});
test('转盘等待插屏期间不抽结果不启动动画，连点一次，关闭后才开始',()=>{
  const f=pageFixture('index');f.page.spin();f.page.spin();assert.equal(f.requests,1);assert.equal(f.page.resultIndex,undefined);assert.equal(f.frames.size,0);
  f.close();assert.equal(f.page.data.spinning,true);assert.equal(f.frames.size,1);
  const gone=pageFixture('index');gone.page.spin();gone.page.onHide();gone.close();assert.equal(gone.page.data.spinning,false);assert.equal(gone.frames.size,0);
});
test('换题按钮和滑动共用插屏门槛，等待广告期间不消耗题目',()=>{
  const f=pageFixture('game'),old=f.page.data.question,read=f.page.data.questionRead;
  f.page.nextQuestion();f.page.nextQuestion();assert.equal(f.requests,1);assert.equal(f.page.data.question,old);assert.equal(f.page.data.questionRead,read);
  f.page.switchTruth({currentTarget:{dataset:{mode:'dares'}}});assert.equal(f.page.data.truth,true);
  f.close();assert.notEqual(f.page.data.question,old);assert.equal(f.page.data.questionRead,read+1);
  const gone=pageFixture('game');gone.page.nextQuestion();gone.page.onHide();gone.close();assert.equal(gone.page.data.questionRead,1);
});
test('抛硬币命中广告先等待，关闭后才生成结果，退出时不开始抛掷',()=>{
  const f=pageFixture('coin');f.page.flip();f.page.flip();assert.equal(f.requests,1);assert.equal(f.page.pending,undefined);assert.equal(f.timers.size,0);
  f.close();assert.equal(f.page.data.flipping,true);f.page.finish();assert.equal(f.page.data.total,1);
  const gone=pageFixture('coin');gone.page.flip();gone.page.onHide();gone.close();assert.equal(gone.page.data.flipping,false);assert.equal(gone.timers.size,0);
});

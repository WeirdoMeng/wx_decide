const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const rules=require('../miniprogram/dice/rules'),scene=require('../miniprogram/dice/scene'),motion=require('../miniprogram/dice/motion');
function fixture({sensorFailure=false,offerAd=false,rejectAd=false}={}){
 let definition,listener,adCallback;const timers=new Map(),saved={},calls={start:0,stop:0,attach:0,detach:0,sound:[],destroy:0,roll:0,open:0,close:0};let id=0;
 calls.adDecisions=[];calls.adPlays=[];calls.adCancel=0;calls.adDispose=0;
 const ads={shouldOffer(placement){calls.adDecisions.push(placement);return offerAd;},controller(){return{play(done,request){calls.adPlays.push(request.placement);if(rejectAd)return false;adCallback=done;},cancel(){calls.adCancel++;adCallback=null;},dispose(){calls.adDispose++;adCallback=null;}};}};
 const later=fn=>{timers.set(++id,fn);return id;};
 class Renderer{setState(){}cancel(){timers.clear();}dispose(){this.cancel();}roll(values,finish,start){calls.roll++;if(start)start();later(finish);}open(fn){calls.open++;later(fn);}close(fn){calls.close++;later(fn);}}
 class Audio{play(type){calls.sound.push(type);}stop(){calls.destroy++;}dispose(){calls.destroy++;}}
 const wx={startAccelerometer(options){calls.start++;if(sensorFailure)options.fail();},stopAccelerometer(){calls.stop++;},onAccelerometerChange(fn){listener=fn;calls.attach++;},offAccelerometerChange(fn){assert.equal(fn,listener);listener=null;calls.detach++;},showModal(){}};
 const storage={read:(key,fallback)=>key in saved?saved[key]:fallback,write:(key,value)=>{saved[key]=value;},feedback(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/dice/pages/play/index.js'),'utf8'),{Page:value=>definition=value,require:name=>name.includes('/ads')?ads:name.includes('storage')?storage:name.includes('audio')?{DiceAudio:Audio}:name.includes('renderer')?{DiceRenderer:Renderer}:rules,wx,console,Date,Math});
 const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(value){Object.assign(this.data,value);}};page.onLoad();page._renderer=new Renderer();page.data.renderReady=true;page.onShow();
 return {page,calls,saved,timers,closeAd(){const fn=adCallback;adCallback=null;if(fn)fn();},emit:value=>listener&&listener(value),finish(){const queue=[...timers.values()];timers.clear();queue.forEach(fn=>fn());}};
}
test('摇骰子支持1–6颗、六面随机边界及点数统计',()=>{
 for(const value of [1,2,3,4,5,6]){assert.equal(rules.roll(value,()=>0).length,value);assert.ok(rules.roll(value,()=>0).every(n=>n===1));assert.ok(rules.roll(value,()=>.99999).every(n=>n===6));}
 for(const value of [0,7,-1,1.5,'abc',null])assert.equal(rules.count(value),5);
 assert.equal(rules.summary([1,1,3,6]).total,11);assert.deepEqual(rules.summary([1,1,3,6]).counts.map(x=>x.number),[2,0,1,0,0,1]);
});
test('重复摇动被锁定，开盖动画完成才揭晓，重新盖盅开盅不抽新结果',()=>{
 const {page,calls,timers,finish}=fixture();page.toggleCup();assert.equal(page.data.phase,'ready');page.shake();page.shake();assert.equal(calls.roll,1);assert.equal(timers.size,1);assert.equal(page.data.phase,'rolling');assert.deepEqual(calls.sound,['cup']);
 page.chooseCount({currentTarget:{dataset:{count:1}}});assert.equal(page.data.count,5);finish();assert.equal(page.data.phase,'covered');assert.equal(page.data.round,1);assert.equal(page.data.dice.length,0);
 page.toggleCup();assert.equal(page.data.phase,'opening');assert.equal(page.data.dice.length,0);page.toggleCup();page.shake();assert.equal(calls.open,1);assert.equal(calls.roll,1);finish();
 const first=page.data.dice.map(d=>d.value),sum=page.data.total;assert.equal(page.data.phase,'open');assert.equal(first.length,5);assert.equal(sum,first.reduce((a,b)=>a+b,0));
 page.toggleCup();assert.equal(page.data.phase,'closing');finish();assert.equal(page.data.phase,'covered');assert.equal(page.data.dice.length,0);page.toggleCup();finish();assert.deepEqual(page.data.dice.map(d=>d.value),first);assert.equal(page.data.total,sum);
 page.chooseCount({currentTarget:{dataset:{count:6}}});assert.equal(page.data.phase,'ready');page.shake();finish();page.toggleCup();finish();assert.equal(page.data.dice.length,6);
});
test('连续两次加速度触发一次3D摇盅，关闭开关移除自身监听',()=>{
 const {page,calls,timers,emit}=fixture();assert.equal(calls.attach,1);page._motionCooldown=0;
 emit({x:0,y:0,z:1});emit({x:3,y:0,z:1});assert.equal(page.data.phase,'ready');emit({x:-3,y:0,z:1});assert.equal(page.data.phase,'rolling');emit({x:3,y:0,z:1});assert.equal(timers.size,1);assert.equal(calls.roll,1);
 page.toggleMotion();assert.equal(page.data.motionEnabled,false);assert.equal(calls.detach,1);assert.equal(calls.stop,1);page.onHide();page.onUnload();assert.equal(calls.detach,1);
});
test('离开页面取消3D帧动画，迟到回调不能结算，返回重新绑定传感器',()=>{
 const {page,calls,timers}=fixture();page.shake();const stale=[...timers.values()][0];page.onHide();assert.equal(timers.size,0);assert.equal(calls.detach,1);assert.equal(calls.stop,1);assert.equal(page.data.phase,'ready');stale();assert.equal(page.data.round,0);
 page.onShow();assert.equal(calls.attach,2);page.onUnload();assert.equal(calls.detach,2);assert.ok(calls.destroy>=2);
});
test('开盖或合盖时切后台，状态与恢复后的模型保持一致',()=>{
 const {page,finish}=fixture();page.shake();finish();page.toggleCup();page.onHide();assert.equal(page.data.phase,'open');const values=page.data.dice.map(x=>x.value);page.onShow();page.toggleCup();page.onHide();assert.equal(page.data.phase,'covered');page.onShow();page.toggleCup();finish();assert.deepEqual(page.data.dice.map(x=>x.value),values);
});
test('传感器启动失败时仍可点击按钮摇盅；未加载模型不能开始',()=>{
 const {page,finish}=fixture({sensorFailure:true});assert.equal(page.data.motionAvailable,false);page.data.renderReady=false;page.shake();assert.equal(page.data.phase,'ready');page.data.renderReady=true;page.shake();finish();page.toggleCup();finish();assert.equal(page.data.phase,'open');
});
test('上滑开盖、下滑盖盅，同一次手势的tap不会重复触发',()=>{
 const {page,finish,calls}=fixture();page.shake();finish();page.sceneTouchStart({touches:[{clientY:200}]});page.sceneTouchEnd({changedTouches:[{clientY:140}]});page.sceneTap();assert.equal(calls.open,1);finish();assert.equal(page.data.phase,'open');page.sceneTouchStart({touches:[{clientY:100}]});page.sceneTouchEnd({changedTouches:[{clientY:170}]});finish();assert.equal(page.data.phase,'covered');
});
test('原模型索引与顶点边界完整，实际使用独立盅体/底盘/骰子',()=>{
 const bytes=fs.readFileSync(path.join(__dirname,'../miniprogram/dice/assets/scene.bin'));
 for(const name of ['cup','tray','die']){const m=scene.meshes[name];assert.ok(m.vertexCount>2000);assert.ok(m.vertexOffset+m.vertexCount*16<=bytes.length);assert.ok(m.indexOffset+m.indexCount*2<=bytes.length);for(let i=0;i<m.indexCount;i++)assert.ok(bytes.readUInt16LE(m.indexOffset+i*2)<m.vertexCount);}
 assert.deepEqual(scene.sourceMeshIds,{cup:274,tray:326,die:330});
 const route=require('../miniprogram/utils/login-route');assert.deepEqual(route.destination('dice/pages/play/index'),{url:'/dice/pages/play/index',tab:false});
});
test('原动画包含抬起/横移开盖、逆向盖盅及完整摇动轨迹',()=>{
 const open=scene.clips.open_2.duration,close=scene.clips.open_3.duration;
 assert.ok(Math.abs(open-1/3)<1e-6);assert.ok(Math.abs(scene.clips.rock_2.duration-1.233333)<1e-5);
 assert.ok(Math.abs(motion.sample('open_2',0)[7])<.001);assert.ok(Math.abs(motion.sample('open_2',open)[7])>20);
 assert.ok(motion.sample('open_2',.15)[8]>10);assert.ok(Math.abs(motion.sample('open_3',close)[7])<.001);
 assert.ok(scene.clips.rock_2.frames.some(frame=>frame[2]>6));
 for(const name of Object.keys(scene.clips))for(const frame of scene.clips[name].frames)for(const n of frame)assert.ok(Number.isFinite(n));
});
test('骰子运动有底盘和盅壁边界，原三段音效为完整非空PCM WAV',()=>{
 const particles=motion.particles([1,2,3,4,5,6],()=>.8);for(let i=0;i<80;i++)motion.step(particles,.016);assert.ok(particles.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));assert.ok(particles.every(p=>p.y>.9&&p.y<11));
 for(const [name,duration]of [['cup',1.294],['dice',.207],['table',.206]]){const bytes=fs.readFileSync(path.join(__dirname,'../miniprogram/dice/assets/'+name+'.wav'));assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WAVE');assert.ok(bytes.some((v,i)=>i>44&&v!==0));const channels=bytes.readUInt16LE(22),rate=bytes.readUInt32LE(24),width=bytes.readUInt16LE(34)/8;assert.ok(Math.abs((bytes.length-44)/(channels*rate*width)-duration)<.01);}
});
test('骰子音效遵循应用声音设置，关闭时不创建或播放，停止销毁所有声道',()=>{
 const file=path.join(__dirname,'../miniprogram/dice/audio.js');let enabled=false,created=0,played=0,stopped=0,destroyed=0;const voices=[];const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:()=>({getSettings:()=>({sound:enabled})})});
 const audio=new module.exports.DiceAudio({createInnerAudioContext(){created++;const voice={handlers:{},onError(fn){this.handlers.error=fn;},onPlay(fn){this.handlers.play=fn;},onEnded(fn){this.handlers.ended=fn;},onStop(fn){this.handlers.stop=fn;},seek(){},stop(){stopped++;this.handlers.stop();},play(){played++;this.handlers.play();},destroy(){destroyed++;}};voices.push(voice);return voice;}});
 audio.play('cup');assert.equal(created,0);enabled=true;audio.play('cup');audio.play('dice');audio.play('table');assert.equal(played,3);assert.ok(voices.every(v=>v.obeyMuteSwitch===false));assert.ok(voices.every(v=>v.src.startsWith('/dice/assets/')));enabled=false;audio.play('cup');assert.equal(played,3);audio.stop();audio.dispose();audio.dispose();assert.equal(destroyed,3);assert.equal(stopped,3);
});

test('摇一摇与开盅按钮共用广告入口，关闭广告后继续原动作；盖盅也接入而手势不额外触发',()=>{
 const h=fixture({offerAd:true}),{page,calls}=h;
 page.cupButton();assert.equal(calls.adDecisions.length,0);
 page.shakeButton();page.shakeButton();page.shake();assert.equal(calls.roll,0);assert.equal(page.data.adPending,true);assert.deepEqual(calls.adDecisions,['diceShake']);
 page.chooseCount({currentTarget:{dataset:{count:1}}});assert.equal(page.data.count,5);
 h.closeAd();assert.equal(calls.roll,1);h.finish();page.cupButton();page.cupButton();page.toggleCup();assert.equal(calls.open,0);assert.deepEqual(calls.adPlays,['diceShake','diceOpen']);
 const values=page._values.slice();h.closeAd();h.finish();assert.deepEqual(page.data.dice.map(d=>d.value),values);
 page.cupButton();assert.equal(calls.close,0);assert.equal(calls.adPlays[2],'diceClose');h.closeAd();h.finish();assert.equal(calls.close,1);page.sceneTap();h.finish();assert.equal(calls.adDecisions.length,3);
});
test('广告未命中时直接摇动，后台取消等待、卸载释放广告实例',()=>{
 const miss=fixture();miss.page.shakeButton();assert.equal(miss.calls.roll,1);
 const h=fixture({offerAd:true});h.page.shakeButton();h.page.onHide();h.closeAd();assert.equal(h.calls.roll,0);assert.equal(h.page.data.adPending,false);assert.equal(h.calls.adCancel,1);h.page.onShow();h.page.onUnload();assert.equal(h.calls.adDispose,1);
 const rejected=fixture({offerAd:true,rejectAd:true});rejected.page.shakeButton();assert.equal(rejected.page.data.adPending,false);assert.equal(rejected.calls.roll,0);
});

test('切换骰子数量先走概率广告，重复或无效选项不计数，广告后再清空旧结果',()=>{
 const h=fixture({offerAd:true}),{page,calls}=h;page.shake();h.finish();
 page.chooseCount({currentTarget:{dataset:{count:5}}});page.chooseCount({currentTarget:{dataset:{count:9}}});assert.equal(calls.adDecisions.length,0);
 page.chooseCount({currentTarget:{dataset:{count:3}}});page.chooseCount({currentTarget:{dataset:{count:2}}});
 assert.deepEqual(calls.adDecisions,['diceCount']);assert.equal(page.data.count,5);assert.equal(page.data.phase,'covered');
 h.closeAd();assert.equal(page.data.count,3);assert.equal(page.data.phase,'ready');assert.equal(page._values,null);assert.equal(h.saved['party:dice-count'],3);
 const miss=fixture();miss.page.chooseCount({currentTarget:{dataset:{count:1}}});assert.equal(miss.page.data.count,1);
});

test('骰子声道首次播放、自然结束、重复清理均不停止空闲音频，待播放声道直接销毁',()=>{
 const file=path.join(__dirname,'../miniprogram/dice/audio.js'),module={exports:{}},voices=[];
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:()=>({getSettings:()=>({sound:true})})});
 const audio=new module.exports.DiceAudio({createInnerAudioContext(){const h={},v={stops:0,destroys:0,seeks:0,onPlay(fn){h.play=fn;},onStop(fn){h.stop=fn;},onEnded(fn){h.end=fn;},onError(fn){h.error=fn;},play(){},seek(){this.seeks++;},stop(){this.stops++;h.stop();},destroy(){this.destroys++;},h};voices.push(v);return v;}});
 audio.play('cup');assert.equal(voices[0].stops,0);audio.stop();audio.stop();assert.equal(voices[0].destroys,1);assert.equal(voices[0].stops,0);
 audio.play('cup');const v=voices[1];v.h.play();audio.play('cup');assert.equal(v.stops,0);assert.equal(v.seeks,1);v.h.end();audio.stop();assert.equal(v.stops,0);
 audio.play('cup');v.h.play();audio.stop();audio.stop();assert.equal(v.stops,1);audio.dispose();audio.dispose();assert.equal(v.destroys,1);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../miniprogram/utils/decision.js');
const values=new Map();
global.wx={getStorageSync:key=>values.has(key)?values.get(key):'',setStorageSync:(key,value)=>values.set(key,JSON.parse(JSON.stringify(value))),vibrateShort() {}};
const store=require('../miniprogram/utils/storage.js');

test('缺省权重按1抽取，零权重不参与混合权重抽取',()=>{
 const items=[{text:'缺省'},{text:'零',weight:0},{text:'三倍',weight:3}];
 assert.equal(rules.pickWeighted(items,()=>0),0);
 assert.equal(rules.pickWeighted(items,()=>.249),0);
 assert.equal(rules.pickWeighted(items,()=>.25),2);
 assert.equal(rules.pickWeighted(items,()=>.999),2);
});
test('全零权重等概率，排除选项不出现在有效扇区',()=>{
 const items=rules.activeItems([{text:'A',weight:0},{text:'排除',weight:100,excluded:true},{text:'B',weight:0}]);
 assert.equal(items.length,2);assert.equal(rules.pickWeighted(items,()=>0),0);assert.equal(rules.pickWeighted(items,()=>.9),1);
});
test('加权抽取目标角度始终落在对应扇区且正向转动至少一圈',()=>{
 const cases=[[{weight:1},{weight:3},{weight:2}],[{weight:0},{weight:1},{weight:9}],[{weight:0},{weight:0}],[{text:'A'},{text:'B'}]];
 cases.forEach(items=>items.forEach((_,index)=>{
  const segment=rules.segments(items)[index];
  [0,.001,.5,.999999].forEach(random=>[0,4,15,1000].forEach(rotation=>{
   const target=rules.targetRotation(items,index,rotation,()=>random);
   const landed=((rules.TAU-target%rules.TAU)%rules.TAU);
   assert.ok(target>rotation+rules.TAU);
   assert.ok(landed>segment.start-1e-10&&landed<segment.start+segment.sweep+1e-10,`${index}: ${landed}`);
  }));
 }));
});
test('不重复抽取支持百万级范围且结果唯一',()=>{
 const result=rules.randomNumbers(0,999999,100,false);
 assert.equal(result.length,100);assert.equal(new Set(result).size,100);assert.ok(result.every(n=>n>=0&&n<=999999));
});
test('支持反向范围、同值范围、重复模式和数量越界提示',()=>{
 assert.deepEqual(rules.randomNumbers(3,1,3,false,()=>0),[1,3,2]);
 assert.deepEqual(rules.randomNumbers(7,7,3,true),[7,7,7]);
 assert.throws(()=>rules.randomNumbers(7,7,2,false),/最多可抽取 1/);
});
test('列表校验保留至少两个参与选项，允许0权重',()=>{
 assert.equal(rules.validateList('我的',[{text:'A',weight:0},{text:'B',weight:0}]),'');
 assert.match(rules.validateList('我的',[{text:'A',weight:1},{text:'B',weight:1,excluded:true}]),/至少保留/);
 assert.match(rules.validateList('我的',[{text:'A',weight:-1},{text:'B',weight:1}]),/权重/);
});
test('模板首启播种、缺省字段可编辑保存、删除后不重新播种',()=>{
 values.clear();let lists=store.getLists();assert.equal(lists.length,2);
 assert.ok(lists.every(list=>list.items.every(item=>item.id&&item.weight===1&&item.excluded===false)));
 const edited=lists[0];edited.title='已修改';edited.items[0].text='改过的选项';
 assert.equal(rules.validateList(edited.title,edited.items),'');store.saveList(edited);
 assert.equal(store.getLists()[0].items[0].text,'改过的选项');
 store.deleteList(lists[1].id);assert.equal(store.getLists().length,1);
 assert.throws(()=>store.deleteList(lists[0].id),/至少保留一个/);
});
test('新建列表置顶、按id更新、选中项持久化',()=>{
 values.clear();store.getLists();const id=store.newId();
 store.saveList({id,title:'自定义',items:[{text:'A',weight:1},{text:'B',weight:2}]});
 assert.equal(store.getLists()[0].id,id);assert.equal(store.read('selected',''),id);
 store.saveList({id,title:'修改',items:[{text:'C',weight:1},{text:'D',weight:2}]});
 assert.equal(store.getLists().filter(item=>item.id===id).length,1);assert.equal(store.getLists()[0].title,'修改');
});
test('声音和震动设置独立持久化，读出的列表不直接修改存储',()=>{
 values.clear();store.getLists();store.saveSettings({sound:false});assert.deepEqual(store.getSettings(),{sound:false,vibration:true});
 store.saveSettings({vibration:false});assert.deepEqual(store.getSettings(),{sound:false,vibration:false});
 const before=store.getLists()[0].title;const copy=store.getLists();copy[0].title='临时';assert.equal(store.getLists()[0].title,before);
});

const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function loadPage(name){
 let definition,clock=0;const timers=new Map();let id=0;
 const pageFile=path.resolve(__dirname,'../miniprogram/pages/'+name+'/index.js');
 const context={Page:value=>{definition=value;},require:request=>require(path.resolve(path.dirname(pageFile),request)),wx:global.wx,Date:{now:()=>clock},Math,console,setInterval:fn=>{timers.set(++id,fn);return id;},clearInterval:key=>timers.delete(key),setTimeout:fn=>{const key=++id;timers.set(key,()=>{timers.delete(key);fn();});return key;},clearTimeout:key=>timers.delete(key)};
 vm.runInNewContext(fs.readFileSync(pageFile,'utf8'),context,{filename:pageFile});
 const page=Object.assign({},definition,{data:JSON.parse(JSON.stringify(definition.data)),setData(update){Object.assign(this.data,update);}});
 return {page,timers,advance(ms){clock+=ms;for(const fn of [...timers.values()])fn();}};
}
test('多指选人至少2指才开始；手指不足2指或系统取消会终止倒计时',()=>{
 const {page,timers,advance}=loadPage('touch');page.onLoad();page.rect={left:0,top:0};
 const one={identifier:1,clientX:100,clientY:100},two={identifier:2,clientX:200,clientY:200};
 page.start({touches:[one]});assert.equal(timers.size,0);
 page.start({touches:[one,two]});assert.equal(timers.size,1);advance(1000);assert.equal(page.data.countdown,2);
 page.end({touches:[one]});assert.equal(timers.size,0);assert.equal(page.data.decided,false);
 page.start({touches:[one,two]});page.cancel();assert.equal(timers.size,0);assert.equal(page.data.count,0);
});
test('多指选人3秒后只选中一位，退出页面不遗留计时器',()=>{
 const {page,timers,advance}=loadPage('touch');page.onLoad();page.rect={left:0,top:0};
 page.start({touches:[{identifier:10,clientX:100,clientY:100},{identifier:20,clientX:200,clientY:200}]});
 advance(3000);assert.equal(page.data.decided,true);assert.equal(page.data.points.filter(p=>p.winner).length,1);assert.equal(timers.size,0);
 page.onHide();assert.equal(page.data.count,0);assert.equal(page.data.decided,false);
});
test('硬币取消不增加统计，完整揭晓仅统计一次，五款皮肤均可直接使用',()=>{
 const {page,timers}=loadPage('coin');page.onLoad();assert.equal(page.data.skins.length,5);
 page.flip();assert.equal(page.data.flipping,true);page.onHide();assert.equal(timers.size,0);assert.equal(page.data.total,0);
 page.flip();page.finish();assert.equal(page.data.total,1);assert.equal(page.data.heads+page.data.tails,1);
 page.finish();assert.equal(page.data.total,1);
 page.choose({currentTarget:{dataset:{index:4}}});assert.equal(page.data.skin,4);
});

test('列表编辑沿用原眼睛排除操作，保存保留已有权重和颜色，最后两项不可删',()=>{
 values.clear();store.getLists();const id=store.newId();store.saveList({id,title:'有权重的列表',type:'wheel',items:[{id:'a',text:'A',weight:3,colorValue:0xff48dcd6,excluded:false},{id:'b',text:'B',weight:0,excluded:true}]});
 global.wx.navigateBack=()=>{};global.wx.showToast=()=>{};
 const {page}=loadPage('list-edit');page.onLoad({id});page.remove({currentTarget:{dataset:{index:0}}});assert.equal(page.data.items.length,2);
 page.data.title='修改后';page.data.items[0].text='改过的A';page.save();const result=store.getLists().find(item=>item.id===id);
 assert.equal(result.items[0].weight,3);assert.equal(result.items[1].weight,0);assert.equal(result.items[0].colorValue,0xff48dcd6);assert.equal(result.items[1].excluded,true);
});
test('原生Canvas先快照再隐藏，列表和结果modal期间隐藏Tab，关闭后恢复',()=>{
 const calls=[],tab=[];global.wx.canvasToTempFilePath=options=>{calls.push(options.canvas);options.success({tempFilePath:'/tmp/wheel-snapshot.png'});};
 const {page}=loadPage('index');page.getTabBar=()=>({setData:value=>tab.push(value)});page.onLoad();page.canvas={id:'native-wheel'};
 page.data.spinning=true;page.openLists();assert.equal(calls.length,0);page.data.spinning=false;page.openLists();
 assert.equal(calls.length,1);assert.equal(page.data.listsOpen,true);assert.equal(page.data.wheelSnapshot,'/tmp/wheel-snapshot.png');assert.equal(tab[tab.length-1].hidden,true);
 page.closeLists();assert.equal(page.data.listsOpen,false);assert.equal(tab[tab.length-1].hidden,false);
 page.showOverlay('resultOpen');assert.equal(page.data.resultOpen,true);page.closeResult();assert.equal(page.data.resultOpen,false);assert.equal(tab[tab.length-1].hidden,false);
 delete global.wx.canvasToTempFilePath;
});
test('转盘原中心和指针绘入同一Canvas，标签保持正立',()=>{
 const {page}=loadPage('index');page.onLoad();page.size=344;page.canvasTop=10.32;page.items=[{text:'火锅',weight:1},{text:'烧烤',weight:1}];page.centerArt={name:'wheel_center'};page.pointerArt={name:'wheel_pointer'};
 const images=[],rotations=[];page.ctx=new Proxy({},{get(_,key){if(key==='drawImage')return(...args)=>images.push(args);if(key==='rotate')return value=>rotations.push(value);if(key==='measureText')return()=>({width:20});if(key==='createLinearGradient')return()=>({addColorStop(){}});return()=>{};},set(){return true;}});
 page.draw();assert.equal(images.length,2);assert.equal(images[0][0],page.centerArt);assert.equal(images[1][0],page.pointerArt);assert.equal(images[1][2],-344*.03);assert.equal(rotations.length,0);
});

test('选中后旧手指未抬起时，新轮只注册新落下的手指，move/end不重新计入旧指',()=>{
 const {page,timers,advance}=loadPage('touch');page.onLoad();page.rect={left:0,top:0};
 const oldA={identifier:1,clientX:100,clientY:100},oldB={identifier:2,clientX:200,clientY:200},newC={identifier:3,clientX:150,clientY:300},newD={identifier:4,clientX:250,clientY:300};
 page.start({touches:[oldA,oldB],changedTouches:[oldA,oldB]});advance(3000);assert.equal(page.data.decided,true);
 page.start({touches:[oldA,oldB,newC],changedTouches:[newC]});assert.equal(page.data.count,1);assert.equal(page.data.points[0].id,3);assert.equal(timers.size,0);
 page.move({touches:[oldA,oldB,newC]});assert.equal(page.data.count,1);assert.equal(page.data.points[0].id,3);
 page.end({touches:[oldB,newC],changedTouches:[oldA]});assert.equal(page.data.count,1);assert.equal(page.data.points[0].id,3);
 page.start({touches:[oldB,newC,newD],changedTouches:[newD]});assert.equal(page.data.count,2);assert.equal(timers.size,1);assert.deepEqual(Array.from(page.data.points,p=>p.id),[3,4]);
 page.onHide();assert.equal(timers.size,0);
});

test('名单新建取消保留原面板，只有编辑保存成功才选中新名单并关闭',()=>{
 values.clear();store.getLists();let componentDefinition,navigation;const emitted=[];
 const file=path.resolve(__dirname,'../miniprogram/components/list-sheet/index.js');
 global.wx.navigateTo=options=>{navigation=options;};global.wx.navigateBack=()=>{};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component(value){componentDefinition=value;},require:request=>require(path.resolve(path.dirname(file),request)),wx:global.wx});
 const component=Object.assign({},componentDefinition.methods,{data:JSON.parse(JSON.stringify(componentDefinition.data)),properties:{show:true,currentId:store.getLists()[0].id},setData(value){Object.assign(this.data,value);},triggerEvent(name,value){emitted.push({name,value});}});
 component.refresh();component.add();componentDefinition.pageLifetimes.show.call(component);assert.equal(emitted.length,0,'取消不选择旧名单或关闭面板');
 component.add();const editor=loadPage('list-edit').page;editor.onLoad({});editor.data.title='保存的新名单';editor.data.items[0].text='A';editor.data.items[1].text='B';
 editor.getOpenerEventChannel=()=>({emit(name,value){navigation.events[name](value);}});editor.save();componentDefinition.pageLifetimes.show.call(component);
 assert.equal(emitted[0].name,'selectlist');assert.equal(emitted[0].value.id,editor.id);assert.equal(emitted[1].name,'close');
});
test('原轮盘Cubic及硬币正弦抛物线、8层金属与Matrix4投影保持源码参数',()=>{
 const motion=require('../miniprogram/utils/motion'),visual=require('../miniprogram/utils/coin-visual');
 assert.ok(Math.abs(motion.wheelEase(.2375)-.7325)<1e-6);assert.equal(motion.wheelEase(0),0);assert.equal(motion.wheelEase(1),1);
 assert.ok(Math.abs(motion.coinArc(.225)-Math.SQRT1_2)<1e-12);assert.equal(motion.coinArc(.45),1);assert.ok(Math.abs(motion.coinArc(.9))<1e-12);
 const layers=visual.layers(0);assert.deepEqual(layers.map(layer=>layer.index),[8,7,6,5,4,3,2,1]);assert.equal(layers[0].middle,'#AAA0FF');assert.equal(layers[1].middle,'#F9F0FF');
 const matrix=visual.matrix(Math.PI/2).slice(9,-1).split(',').map(Number);assert.equal(matrix.length,16);assert.ok(Math.abs(matrix[6]-1)<1e-12);assert.equal(matrix[7],.0015);assert.equal(matrix[9],-1);
 const frame=visual.frame(.351875,0,Math.PI);assert.ok(Math.abs(frame.angle-Math.PI*.815)<1e-6);assert.equal(frame.face,'tails');assert.ok(frame.faceMatrix!==frame.edgeMatrix);
});
test('编辑页末项未填显示faint并提示滚底，新增后260ms滚到底部且离开清理计时器',()=>{
 global.wx.createSelectorQuery=()=>({in(){return this;},select(){return this;},fields(){return this;},boundingClientRect(){return this;},exec(callback){callback([{height:200,scrollTop:20},{height:500}]);}});
 const context=loadPage('list-edit'),page=context.page;const set=page.setData;page.setData=function(value,callback){set.call(this,value);if(callback)callback();};page.onLoad({});assert.equal(page.data.canAdd,false);
 page.add();assert.equal(page.data.items.length,2);context.advance(260);assert.equal(page.data.scrollTop,300);
 page.data.items[1].text='B';page.inputItem({currentTarget:{dataset:{index:1,field:'text'}},detail:{value:'B'}});assert.equal(page.data.canAdd,true);
 page.add();assert.equal(page.data.items.length,3);assert.equal(page.data.canAdd,false);context.advance(130);assert.ok(page.data.scrollTop>160);context.advance(130);assert.equal(page.data.scrollTop,300);assert.equal(context.timers.size,0);page.scrollBottom();assert.equal(context.timers.size,1);page.onHide();assert.equal(context.timers.size,0);
 delete global.wx.createSelectorQuery;
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const layout=require('../miniprogram/utils/layout');

test('标题区域在320/390/430屏宽下避开微信胶囊，工具行在导航下方',()=>{
  for(const width of [320,390,430]){
    const capsule={left:width-104,right:width-8,top:54,bottom:86,width:96,height:32};
    global.wx={getWindowInfo:()=>({windowWidth:width,windowHeight:844,screenHeight:844,statusBarHeight:47,safeArea:{bottom:810}}),getMenuButtonBoundingClientRect:()=>capsule};
    const m=layout.metrics();
    assert.equal(m.headerHeight,93);
    assert.ok(width-m.titleRight<=capsule.left-12);
    assert.ok(width-m.titleRight-60>=140,'long titles retain a usable truncation area');
    assert.ok(m.headerHeight>=capsule.bottom);
    assert.equal(m.helpHeight,44);
    assert.equal(m.safeBottom,34);
  }
});

test('胶囊不可用或返回竖屏过渡期旧坐标时使用稳定的导航后备',()=>{
  for(const getMenu of [()=>{throw Error('not ready');},()=>({width:0,height:0}),()=>({left:750,top:4,bottom:36,width:90,height:32})]){
    global.wx={getWindowInfo:()=>({windowWidth:375,windowHeight:812,statusBarHeight:20}),getMenuButtonBoundingClientRect:getMenu};
    const m=layout.metrics();assert.equal(m.navHeight,44);assert.ok(m.titleRight<200);assert.equal(m.safeBottom,0);
  }
});

function nav(api){
  let definition;
  global.wx=api;
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/components/original-nav/index.js'),'utf8'),{require:()=>layout,wx:api,Component:value=>{definition=value;}});
  const events=[];
  const instance={...definition.methods,data:{},properties:{managedBack:true},setData(value){Object.assign(this.data,value);},triggerEvent(name){events.push(name);}};
  return {definition,instance,events};
}

test('游戏标题栏继续调用页面退出确认，帮助及长按设置事件保持独立',()=>{
  let navigated=false;
  const {instance,events}=nav({navigateBack(){navigated=true;}});
  instance.goBack();instance.showHelp();instance.helpLongPress();
  assert.deepEqual(events,['back','help','helplongpress']);assert.equal(navigated,false);
});

test('普通页面返回保留首页后备，窗口变化重新测量导航',()=>{
  let width=390,route;
  const api={getWindowInfo:()=>({windowWidth:width,windowHeight:844,statusBarHeight:47}),getMenuButtonBoundingClientRect:()=>({left:width-104,top:54,bottom:86,width:96,height:32}),navigateBack({fail}){fail();},switchTab({url}){route=url;}};
  const {definition,instance}=nav(api);instance.properties.managedBack=false;instance.goBack();assert.equal(route,'/pages/index/index');
  definition.lifetimes.attached.call(instance);assert.equal(instance.data.scale,390/375);
  width=320;definition.pageLifetimes.resize.call(instance);assert.equal(instance.data.scale,320/375);assert.equal(instance.data.titleRight,116);
});

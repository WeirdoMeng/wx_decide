const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(file,kind,account,api={}){
 let page;vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/'+file),'utf8'),{[kind]:value=>{page=value;},require:name=>name.endsWith('/account')?account:name.endsWith('/ads')?{startSession(){}}:{},wx:api,console,getCurrentPages:()=>[]});
 return {...page,data:structuredClone(page.data||{}),setData(value){Object.assign(this.data,value);}};
}
test('首页为默认入口，首次启动、扫码和分享直达不触发登录或资料获取',()=>{
 assert.equal(require('../miniprogram/app.json').pages[0],'pages/index/index');
 const account={isReady:()=>false,hasConsent:()=>false,subscribe(){},isAdFree:()=>false,login(){throw Error('不应登录');}};
 const app=load('app.js','App',account,{reLaunch(){throw Error('不应跳转');}});app.onLaunch();
 for(const path of ['pages/index/index','pages/party/index','pages/mine/index','pages/game/index','dice/pages/play/index','billiards/pages/table/index'])app.onShow({path,query:{type:'truth'}});
});
test('已主动登录过的账户可恢复权益，不弹出资料填写',async()=>{
 let logins=0,refresh=0,ready=false;
 const account={isReady:()=>ready,hasConsent:()=>true,login:async()=>{logins++;},refresh:async()=>{refresh++;}};
 const app=load('app.js','App',account);app.onShow();ready=true;app.onShow();assert.equal(logins,1);assert.equal(refresh,1);
});
test('我的页允许游客浏览，购买和恢复权益才进入无资料要求的登录',()=>{
 const nav=[];let listener,unsubscribed=false;
 const account={isReady:()=>false,isAdFree:()=>false,getState:()=>null,subscribe:fn=>{listener=fn;return()=>{unsubscribed=true;};}};
 const mine=load('pages/mine/index.js','Page',account,{navigateTo:value=>nav.push(value)});
 mine.onLoad();mine.onShow();assert.equal(nav.length,0);assert.equal(mine.data.loggedIn,false);assert.equal(mine.data.name,'游客');
 mine.buy();mine.refreshMembership();assert.equal(nav.length,2);for(const item of nav)assert.doesNotMatch(item.url,/mode=profile/);
 listener();mine.onUnload();assert.equal(unsubscribed,true);
});

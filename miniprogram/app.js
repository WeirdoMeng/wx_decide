const ads = require('./utils/ads');
const account = require('./utils/account');
App({
 globalData:{appName:'小决定'},
 onLaunch(){
  ads.startSession();
  let adFree=account.isAdFree();
  account.subscribe(()=>{const next=account.isAdFree();if(next===adFree)return;adFree=next;getCurrentPages().forEach(page=>{if(typeof page.onMembershipChange==='function')page.onMembershipChange();});});
 },
 onShow(options){
  ads.startSession();
  // 普通入口由登录页承接；分享/扫码直达也统一经过登录。
  if(!account.isReady()){
   const path=options&&options.path;
   if(path&&path!=='pages/login/index'){
    const query=Object.entries(options.query||{}).map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(value)).join('&');
    const next=path+(query?'?'+query:'');
    wx.reLaunch({url:'/pages/login/index?next='+encodeURIComponent(next)});
   }
  }else account.refresh().catch(()=>{});
 }
});

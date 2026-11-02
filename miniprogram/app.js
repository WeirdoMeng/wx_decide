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
  // 游客可直接浏览和游玩；仅恢复用户之前主动登录的账户，不索取头像昵称。
  if(account.isReady())account.refresh().catch(()=>{});
  else if(account.hasConsent())account.login().catch(()=>{});
 }
});

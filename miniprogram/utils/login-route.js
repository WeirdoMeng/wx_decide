// 微信运行时不依赖 require(JSON)；回跳仅允许已注册的本地页面。
const routes=['pages/index/index','pages/party/index','pages/mine/index','pages/lists/index','pages/list-edit/index','pages/coin/index','pages/number/index','pages/touch/index','pages/game/index','billiards/pages/table/index'];
const tabs=['pages/index/index','pages/party/index','pages/mine/index'];
function destination(value){
  const next=String(value||'').replace(/^\//,''),route=next.split('?')[0];
  if(!routes.includes(route))return {url:'/pages/index/index',tab:true};
  const tab=tabs.includes(route);return {url:'/'+(tab?route:next),tab};
}
module.exports={destination,routes,tabs};

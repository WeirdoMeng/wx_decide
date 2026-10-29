function compareVersion(left,right){
  const a=String(left).split('.').map(Number),b=String(right).split('.').map(Number);
  for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d>0?1:-1;}return 0;
}
function unavailable(api,payEnv=0){
  if(typeof api.requestVirtualPayment!=='function')return '请更新微信后再购买';
  const info=api.getSystemInfoSync?api.getSystemInfoSync():{};
  if(info.platform==='ios'){
    if(payEnv===1)return 'Apple 支付不支持沙盒，请使用 Android 手机测试';
    const system=String(info.system||'').match(/\d+(?:\.\d+)*/);
    if(!system||compareVersion(system[0],'15')<0||compareVersion(info.version||'0','8.0.68')<0)return 'iPhone 购买需要 iOS 15 及以上、微信 8.0.68 及以上版本';
  }
  return '';
}
function request(api,payData){return new Promise((resolve,reject)=>api.requestVirtualPayment({...payData,success:resolve,fail:reject}));}
module.exports={compareVersion,unavailable,request};

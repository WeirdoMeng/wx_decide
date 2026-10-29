const DIAGNOSTIC_KEY='little-decision:billiards:lastDiagnostic:v2';
function errorInfo(error){
  if(error===null||error===undefined)return{name:'Error',message:String(error)};
  const item={name:String(error.name||'Error'),message:String(error.message||error.errMsg||error),stack:String(error.stack||'').slice(0,3500)};
  if(error.cause)item.cause={name:String(error.cause.name||'Error'),message:String(error.cause.message||error.cause)};
  return item;
}
function collectDevice(api){let device={};try{device=api.getSystemInfoSync?api.getSystemInfoSync():{};}catch(_){}return{platform:device.platform||'',system:device.system||'',model:device.model||'',brand:device.brand||'',wechatVersion:device.version||'',SDKVersion:device.SDKVersion||'',pixelRatio:device.pixelRatio||0,screenWidth:device.screenWidth||0,screenHeight:device.screenHeight||0};}
function createDiagnostics(api,mode){
  const report={version:2,mode,startedAt:new Date().toISOString(),stage:'page-load',device:collectDevice(api),events:[],error:null};const begin=Date.now();
  function save(){try{if(api.setStorageSync)api.setStorageSync(DIAGNOSTIC_KEY,report);}catch(_){} }
  function mark(stage,details){report.stage=stage;report.events.push({stage,elapsedMs:Date.now()-begin,...(details?{details}:{} )});if(report.events.length>35)report.events.splice(0,report.events.length-35);save();}
  function fail(error){report.error=errorInfo(error);mark(report.stage,{failed:true});save();return report;}
  function text(){return JSON.stringify(report,null,2);}
  function summary(){const info=report.error;return '阶段：'+report.stage+'\n原因：'+(info?info.message:'未知')+(info&&info.cause?'\n内部原因：'+info.cause.message:'');}
  mark('page-load');return{report,mark,fail,text,summary};
}
module.exports={createDiagnostics,errorInfo,DIAGNOSTIC_KEY};

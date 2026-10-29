const config=require('../data/account-config');
const storage=require('./storage');
function createAccount(options={}){
  const api=options.api||(()=>typeof wx==='undefined'?{}:wx),cfg=options.config||config,store=options.storage||storage;
  let state=null,pending=null,initialized=false,revision=0,active=cfg;
  const listeners=new Set();
  function emit(){listeners.forEach(listener=>listener(state));}
  function setup(){
    if(initialized)return;
    const wxApi=api(),cloud=wxApi.cloud;
    let info;
    if(wxApi.getAccountInfoSync){
      info=wxApi.getAccountInfoSync();const actual=info&&info.miniProgram&&info.miniProgram.appId;
      if(cfg.appId&&actual&&actual!==cfg.appId)throw Error('当前 AppID 为 '+actual+'，请使用 '+cfg.appId+' 重新打开项目');
    }
    if(cfg.sandboxFunctionName){
      const version=info&&info.miniProgram&&info.miniProgram.envVersion;
      if(!['develop','trial','release'].includes(version))throw Error('无法识别小程序版本，请重新编译或预览后登录');
      active={...cfg,payEnv:version==='release'?0:1,functionName:version==='release'?cfg.functionName:cfg.sandboxFunctionName};
    }else active={...cfg,payEnv:cfg.payEnv===1?1:0};
    if(!cloud||typeof cloud.init!=='function')throw Error('当前微信不支持云服务，请更新微信');
    cloud.init({env:cfg.cloudEnv,traceUser:false});initialized=true;
  }
  function code(){return new Promise((resolve,reject)=>{const wxApi=api();if(!wxApi.login){reject(Error('当前环境不支持微信登录'));return;}wxApi.login({success:result=>result.code?resolve(result.code):reject(Error('登录凭证获取失败')),fail:()=>reject(Error('微信登录失败，请重试'))});});}
  async function call(action,data={}){
    setup();let result;
    try{result=await api().cloud.callFunction({name:active.functionName,data:{action,...data},config:{env:cfg.cloudEnv}});}
    catch(err){
      const raw=String(err&& (err.errCode||err.code)||'CLOUD_CALL_FAILED');
      const code=/^[\w.:-]{1,80}$/.test(raw)?raw:'CLOUD_CALL_FAILED';
      const detail=String(err&&(err.errMsg||err.message)||'');
      let hint='请检查云函数部署、环境及调用权限';
      if(/fetch is not defined|AbortSignal is not defined/i.test(detail))hint='云函数运行时不兼容，请重新部署最新 membership 代码';
      else if(/cannot find module/i.test(detail))hint='云函数缺少依赖，请选择云端安装依赖后重新部署';
      else if(/function.*not.?found|function.*not.?exist|FUNCTION_NOT_FOUND/i.test(detail))hint='未找到 '+active.functionName+' 云函数，请核对部署环境';
      // 只记录错误码，不打印含登录凭证或密钥的原始请求/错误对象。
      console.error('[account] cloud-call',{action,code});
      throw Object.assign(Error('账户服务调用失败（'+code+'），'+hint),{code});
    }
    if(!result.result||result.result.ok!==true){
      const detail=result.result&&result.result.error;
      const code=detail&&/^[\w.:-]{1,80}$/.test(String(detail.code))?String(detail.code):'INVALID_RESPONSE';
      const message=String(detail&&detail.message||'账户服务返回异常，请核对云函数部署');
      // 输出一行可复制的诊断，只包含服务器已脱敏的说明，不打印原响应/订单/凭证。
      console.error('[account] cloud-result '+JSON.stringify({action,code,functionName:active.functionName,payEnv:active.payEnv,version:detail&&detail.version||'未提供',stage:detail&&detail.stage||'',message}));
      throw Object.assign(Error(message+'（'+code+'）'),{code});
    }
    return result.result.data;
  }
  function apply(value,version){
    if(version!==revision)return;
    if((value.catalogue.payEnv||0)!==active.payEnv)throw Error('支付环境不一致，请重新部署对应版本的云函数');
    const entitlement=state&&(state.entitlement.version||0)>(value.entitlement.version||0)?state.entitlement:value.entitlement;
    const user=state&&(state.user.profileVersion||0)>(value.user.profileVersion||0)?state.user:value.user;
    state={user,entitlement,catalogue:value.catalogue};emit();
  }
  async function login(){
    if(pending)return pending;
    const version=revision;
    const job=(async()=>{const value=await call('login');if(version!==revision)return null;store.write('account:consent',true);apply(value,version);return state;})();
    pending=job;try{return await job;}finally{if(pending===job)pending=null;}
  }
  async function refresh(restore=false){
    if(!state)return null;const version=revision,value=await call(restore?'restore':'status');apply(value,version);return state;
  }
  function isReady(){return !!state;}
  function isAdFree(){return !!(state&&state.entitlement&&state.entitlement.adFree===true);}
  function logout(){revision++;state=null;pending=null;store.write('account:consent',false);emit();}
  return {config:cfg,login,refresh,isReady,isAdFree,logout,getState:()=>state,hasConsent:()=>store.read('account:consent',false)===true,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    async updateProfile(nickname,avatarPath){
      if(!state)throw Error('请先微信登录');
      const wxApi=api(),version=revision;
      const avatarBase64=await new Promise((resolve,reject)=>{
        if(!wxApi.getFileSystemManager){reject(Error('当前微信暂不支持头像保存'));return;}
        wxApi.getFileSystemManager().readFile({filePath:avatarPath,encoding:'base64',success:result=>resolve(result.data),fail:()=>reject(Error('请重新选择头像'))});
      });
      if(version!==revision||!state)return null;
      const result=await call('updateProfile',{nickname,avatarBase64});apply(result,version);return state;
    },
    async createOrder(){
      if(!state)throw Error('请先微信登录');
      const order=await call('createOrder',{code:await code()});
      let env;try{env=JSON.parse(order.payData.signData).env;}catch(_){throw Error('支付参数返回异常');}
      if(env!==active.payEnv)throw Error('支付环境不一致，已停止付款');
      return order;
    },
    async query(orderId){const version=revision,result=await call('query',{orderId});apply(result,version);return result;}
  };
}
const account=createAccount();module.exports=Object.assign(account,{createAccount});

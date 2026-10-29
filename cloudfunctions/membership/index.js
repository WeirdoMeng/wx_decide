const cloud=require('wx-server-sdk');
const {createRepository}=require('./lib/repository');
const {createProvider,error}=require('./lib/payment');
const {createService}=require('./lib/service');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const handlerVersion='profile-20261029-v1';
const config={payEnv:0,appId:process.env.WX_APP_ID||'wx9caeac69341808c8',appSecret:process.env.WX_APP_SECRET||'',offerId:process.env.VIRTUAL_OFFER_ID||'1450698692',appKey:process.env.VIRTUAL_APP_KEY||'',productId:process.env.VIRTUAL_PRODUCT_ID||'1000001'};
const service=createService({repo:createRepository(cloud.database(),{prefix:config.payEnv===1?'sandbox_':''}),provider:createProvider(config),config,avatarStore:{
  save:async(cloudPath,fileContent)=>(await cloud.uploadFile({cloudPath,fileContent})).fileID,
  remove:fileID=>cloud.deleteFile({fileList:[fileID]}),
  url:async fileID=>{const result=await cloud.getTempFileURL({fileList:[fileID]});return result.fileList[0]&&result.fileList[0].tempFileURL;}
}});
exports.main=async event=>{
  const context=cloud.getWXContext(),push=event&&event.MsgType==='event';
  try{
    // 推送接云平台消息路由；所有权益变更仍须微信服务端查单核实。
    if(push){
      // 微信消息仍统一投递 membership；沙盒单转发到独立函数和数据集合。
      const orderId=event.OutTradeNo||event.MchOrderId||'';
      if(config.payEnv===0&&(Number(event.Env)===1||/^S/.test(orderId))){
        const result=await cloud.callFunction({name:'membership_sandbox',data:event});return result.result;
      }
      return await service.notify(event);
    }
    if(event.Type==='Timer'){
      if(context.OPENID||event.TriggerName!=='reconcileOrders')throw error('INVALID_TIMER_SOURCE','非法定时任务来源');
      return await service.reconcilePending();
    }
    if(context.APPID!==config.appId||!context.OPENID)throw error('UNAUTHORIZED','请使用正确的小程序微信登录');
    let data;
    switch(event.action){
      case 'login':data=await service.login(context.OPENID);break;
      case 'status':data=await service.status(context.OPENID);break;
      case 'updateProfile':data=await service.updateProfile(context.OPENID,{nickname:event.nickname,avatarBase64:event.avatarBase64});break;
      case 'createOrder':data=await service.createOrder(context.OPENID,event.code);break;
      case 'query':data=await service.query(context.OPENID,event.orderId);break;
      case 'restore':data=await service.restore(context.OPENID);break;
      default:throw error('INVALID_ACTION','不支持的请求');
    }
    return {ok:true,data};
  }catch(err){
    // 不输出openid、session_key、签名、AppKey、AppSecret、access_token或完整事件。
    const raw=String(err.code||err.errCode||'INTERNAL_ERROR');
    const code=/^[\w.:-]{1,80}$/.test(raw)?raw:'INTERNAL_ERROR';
    console.error('[membership]',{action:push?'notification':event.action||event.Type,code,...(err.diagnostic||{})});
    if(push)return {ErrCode:1,ErrMsg:'processing_failed'};
    return {ok:false,error:{code,message:err.clientSafe?err.message:'云端处理失败，请核对云函数日志和数据库配置',stage:err.diagnostic&&err.diagnostic.stage||'',version:handlerVersion}};
  }
};

const crypto=require('node:crypto');
const {hash,error,orderNumber,paymentData}=require('./payment');
const USERS='member_users',ORDERS='member_orders',GRANTS='member_grants';
function createService({repo,provider,config,avatarStore,now=Date.now}){
  const payEnv=config.payEnv===1?1:0;
  const uid=openid=>hash(config.appId+':'+openid);
  const catalogue=()=>({name:'终生免广告',payEnv,priceFen:990,ready:!!(config.offerId&&config.productId&&config.appKey&&config.appSecret)});
  function identity(openid){if(typeof openid!=='string'||!openid)throw error('UNAUTHORIZED','请先微信登录');}
  async function user(openid){identity(openid);return repo.get(USERS,uid(openid));}
  async function publicState(record){
    let avatarUrl=record.avatarFileId||'';
    // 服务端签发临时地址，不需要放宽用户云存储权限；图片失败不阻断支付查询。
    if(avatarUrl&&avatarStore&&avatarStore.url){try{avatarUrl=await avatarStore.url(avatarUrl)||avatarUrl;}catch(_){} }
    return {user:{id:record.id.slice(0,16),name:record.nickname||'微信用户',avatarUrl,profileComplete:!!(record.nickname&&record.avatarFileId),profileVersion:record.profileVersion||0},entitlement:{version:record.revision||0,adFree:(record.activeOrders||[]).length>0,lifetime:(record.activeOrders||[]).length>0},catalogue:catalogue()};
  }
  async function status(openid){const record=await user(openid);if(!record)throw error('LOGIN_REQUIRED','请先微信登录');return publicState(record);}
  async function login(openid){
    // openid 只能由入口从 getWXContext 获取，不能采用客户端传入的身份。
    // 云开发已完成微信鉴权；仅支付签名需要额外 code2Session。
    identity(openid);
    await repo.transaction(async tx=>{const id=uid(openid),existing=await tx.get(USERS,id);if(!existing)await tx.set(USERS,id,{id,openid,activeOrders:[],revision:0,createdAt:now()});});
    return status(openid);
  }
  async function createOrder(openid,code){
    const record=await user(openid);if(!record)throw error('LOGIN_REQUIRED','请先微信登录');
    if(record.activeOrders.length)throw error('ALREADY_MEMBER','你已开通终生免广告，无需重复购买');
    if(!catalogue().ready)throw error('PAYMENT_NOT_CONFIGURED','支付商品尚未配置');
    const session=await provider.exchange(code);if(session.openid!==openid)throw error('IDENTITY_MISMATCH','支付账户不一致');
    const order={id:orderNumber(payEnv),env:payEnv,openid,productId:config.productId,priceFen:990,quantity:1,attach:crypto.randomBytes(12).toString('hex'),state:'pending',createdAt:now(),checkedAt:0};
    const payData=paymentData(config,order,session.session_key);
    await repo.transaction(async tx=>{const fresh=await tx.get(USERS,record.id);if(fresh.activeOrders.length)throw error('ALREADY_MEMBER','你已开通终生免广告');if(await tx.get(ORDERS,order.id))throw error('ORDER_CONFLICT','请重新下单');await tx.set(ORDERS,order.id,order);});
    return {orderId:order.id,payData};
  }
  async function updateProfile(openid,profile){
    const record=await user(openid);if(!record)throw error('LOGIN_REQUIRED','请先微信登录');
    const nickname=typeof profile.nickname==='string'?profile.nickname.trim():'';
    if(!nickname||[...nickname].length>20||/[\x00-\x1f\x7f]/.test(nickname))throw error('INVALID_PROFILE','请填写20字以内的昵称');
    const encoded=profile.avatarBase64;
    if(typeof encoded!=='string'||encoded.length>700000||!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw error('INVALID_AVATAR','请重新选择头像');
    const bytes=Buffer.from(encoded,'base64');
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(bytes.length>512*1024||(!png&&!jpeg)||bytes.toString('base64')!==encoded)throw error('INVALID_AVATAR','请重新选择较小的头像');
    if(!avatarStore)throw error('PROFILE_UNAVAILABLE','资料暂未保存，请稍后再试');
    const path='member-avatars/'+payEnv+'/'+record.id.slice(0,16)+'/'+crypto.randomBytes(12).toString('hex')+(png?'.png':'.jpg');
    const fileId=await avatarStore.save(path,bytes);
    if(typeof fileId!=='string'||!fileId.startsWith('cloud://'))throw error('PROFILE_UNAVAILABLE','资料暂未保存，请稍后再试');
    let oldFile='';
    try{
      await repo.transaction(async tx=>{
        const fresh=await tx.get(USERS,record.id);if(!fresh)throw error('LOGIN_REQUIRED','请重新登录');
        oldFile=fresh.avatarFileId||'';
        // 仅改资料，保留当前事务读到的会员权益和支付版本。
        await tx.set(USERS,record.id,{...fresh,nickname,avatarFileId:fileId,profileVersion:(fresh.profileVersion||0)+1,profileUpdatedAt:now()});
      });
    }catch(err){if(avatarStore.remove)await avatarStore.remove(fileId).catch(()=>{});throw err;}
    if(oldFile&&oldFile!==fileId&&avatarStore.remove)await avatarStore.remove(oldFile).catch(()=>{});
    return status(openid);
  }
  async function deliver(order,platform){
    const grantId=hash(platform.wx_order_id);
    await repo.transaction(async tx=>{
      const fresh=await tx.get(ORDERS,order.id),grant=await tx.get(GRANTS,grantId),record=await tx.get(USERS,uid(order.openid));
      if(!fresh||fresh.openid!==order.openid||fresh.productId!==config.productId||!record)throw error('ORDER_MISMATCH','订单信息不一致');
      if(fresh.state==='refunded'||(grant&&grant.state==='refunded'))return;
      if(grant&&(grant.orderId!==order.id||grant.openid!==order.openid))throw error('PLATFORM_ORDER_CONFLICT','平台订单不一致');
      const activeOrders=Array.from(new Set([...(record.activeOrders||[]),order.id]));
      await tx.set(GRANTS,grantId,{orderId:order.id,openid:order.openid,wxOrderId:platform.wx_order_id,state:'active',updatedAt:now()});
      await tx.set(USERS,record.id,{...record,activeOrders,revision:(record.revision||0)+(record.activeOrders.includes(order.id)?0:1),updatedAt:now()});
      await tx.set(ORDERS,order.id,{...fresh,state:'delivered_pending_ack',wxOrderId:platform.wx_order_id,paidAt:platform.paid_time,checkedAt:now()});
    });
  }
  async function revoke(order,platform){
    await repo.transaction(async tx=>{
      const fresh=await tx.get(ORDERS,order.id),record=await tx.get(USERS,uid(order.openid));
      if(!fresh||!record)throw error('ORDER_MISMATCH','退款订单信息不一致');
      if(fresh.wxOrderId&&fresh.wxOrderId!==platform.wx_order_id)throw error('PLATFORM_ORDER_CONFLICT','平台退款单不一致');
      const grantId=hash(platform.wx_order_id),grant=await tx.get(GRANTS,grantId);
      if(grant&&grant.orderId!==order.id)throw error('PLATFORM_ORDER_CONFLICT','平台退款单不一致');
      await tx.set(GRANTS,grantId,{orderId:order.id,openid:order.openid,wxOrderId:platform.wx_order_id,state:'refunded',updatedAt:now()});
      await tx.set(USERS,record.id,{...record,revision:(record.revision||0)+(record.activeOrders.includes(order.id)?1:0),activeOrders:(record.activeOrders||[]).filter(id=>id!==order.id),updatedAt:now()});
      await tx.set(ORDERS,order.id,{...fresh,state:'refunded',wxOrderId:platform.wx_order_id,checkedAt:now()});
    });
  }
  async function reconcile(order,options={}){
    if((order.env||0)!==payEnv)throw error('ORDER_ENV_MISMATCH','订单所属支付环境不一致');
    if(!config.appKey||!config.productId)throw error('PAYMENT_NOT_CONFIGURED','支付服务尚未配置');
    const result=await provider.query(order),platform=result.order;
    // 本地订单先保存、随后才拉起收银台。未拉起或取消时微信可能仍返回
    // status=0，其他字段为空/默认值；这是未创建订单，不是已支付订单环境错误。
    if(platform&&platform.status===0&&(!platform.order_id||platform.order_id===order.id)){
      await repo.patch(ORDERS,order.id,{checkedAt:now()});return;
    }
    if(!platform||platform.order_id!==order.id)throw error('ORDER_MISMATCH','查询订单不一致');
    if(platform.env_type!==(payEnv===1?2:1)||![0,7].includes(platform.order_type))throw error('ORDER_ENV_MISMATCH','订单环境或类型不一致');
    if(!platform.wx_order_id){await repo.patch(ORDERS,order.id,{checkedAt:now()});return;}
    if(platform.order_fee!==order.priceFen)throw error('PRICE_MISMATCH','订单金额不一致');
    if([5,8].includes(platform.status)||(Number.isFinite(platform.left_fee)&&platform.left_fee<order.priceFen&&[2,3,4].includes(platform.status))){await revoke(order,platform);return;}
    if(![2,3,4].includes(platform.status)){await repo.patch(ORDERS,order.id,{checkedAt:now()});return;}
    if(platform.paid_fee!==990||order.productId!==config.productId||order.quantity!==1)throw error('PRICE_MISMATCH','支付金额或商品不一致');
    await deliver(order,platform);
    const fresh=await repo.get(ORDERS,order.id);if(fresh.state==='refunded')return;
    // 真实推送由返回ErrCode=0确认，不额外调用确认发货接口。
    // 查单补发才调用该接口；接口失败保留补偿状态，不撤销已确认的付款权益。
    if(platform.status!==4&&!options.notification){
      try{await provider.provide(fresh);}
      catch(err){
        const raw=String(err.code||'ACK_PENDING'),code=/^[\w.:-]{1,80}$/.test(raw)?raw:'ACK_PENDING';
        await repo.patch(ORDERS,order.id,{lastAckCode:code,checkedAt:now()});
        console.warn('[membership] delivery-ack-pending',{code,...(err.diagnostic||{})});return;
      }
    }
    await repo.transaction(async tx=>{const current=await tx.get(ORDERS,order.id);if(current.state!=='refunded')await tx.set(ORDERS,order.id,{...current,state:'delivered',lastAckCode:'',checkedAt:now()});});
  }
  async function query(openid,id){
    identity(openid);if(typeof id!=='string'||!/^[A-Za-z0-9]{8,32}$/.test(id))throw error('INVALID_ORDER','订单号无效');
    const order=await repo.get(ORDERS,id);if(!order||order.openid!==openid)throw error('ORDER_NOT_FOUND','订单不存在');
    await reconcile(order);const current=await repo.get(ORDERS,id);return {...await status(openid),order:{id:current.id,state:current.state}};
  }
  async function restore(openid){
    identity(openid);const orders=await repo.listOrders(openid,5);
    const results=await Promise.allSettled(orders.map(reconcile)),state=await status(openid);
    const failed=results.find(result=>result.status==='rejected');
    // 查询失败不能显示成“没有购买”；已确认的权益仍保留。
    if(failed&&!state.entitlement.adFree)throw failed.reason;
    return state;
  }
  async function notify(event){
    if(event.Event==='xpay_subscribe_ios_refund_query_notify')return {ErrCode:0,ErrMsg:'success',IosRefundQueryResponse:{result_code:0,result_info:'建议由平台审核退款',evidence:'购买项目为终生免广告权益，支持平台审核退款；退款确认后回收对应权益。'}};
    if(!['xpay_goods_deliver_notify','xpay_refund_notify'].includes(event.Event))return {ErrCode:0,ErrMsg:'success'};
    if(event.Event==='xpay_refund_notify'&&Number(event.RetCode)!==0)return {ErrCode:0,ErrMsg:'success'};
    if(event.Env!==undefined&&Number(event.Env)!==payEnv)throw error('ORDER_ENV_MISMATCH','通知所属支付环境不一致');
    const id=event.OutTradeNo||event.MchOrderId,order=typeof id==='string'?await repo.get(ORDERS,id):null;
    if(!order||event.OpenId!==order.openid)throw error('ORDER_MISMATCH','推送账户或订单不一致');
    if(event.Event==='xpay_goods_deliver_notify'){
      const goods=event.GoodsInfo||{};
      if(Number(event.Env)!==payEnv||goods.ProductId!==order.productId||Number(goods.Quantity)!==1||goods.Attach!==order.attach||Number(goods.OrigPrice)!==990||Number(goods.ActualPrice)!==990)throw error('NOTIFY_MISMATCH','发货推送信息不一致');
    }
    // 即使伪造JSON事件，也必须通过微信服务端真实查单，才可能改变权益。
    await reconcile(order,{notification:true});
    const current=await repo.get(ORDERS,order.id);
    if(event.Event==='xpay_refund_notify'&&current.state!=='refunded')throw error('REFUND_PENDING','等待平台退款状态同步');
    if(event.Event==='xpay_goods_deliver_notify'&&!['delivered','refunded'].includes(current.state))throw error('DELIVERY_PENDING','等待平台支付状态同步');
    return {ErrCode:0,ErrMsg:'success'};
  }
  async function reconcilePending(){
    const orders=await repo.pendingOrders(10),results=await Promise.allSettled(orders.map(async order=>{
      try{await reconcile(order);}finally{await repo.patch(ORDERS,order.id,{checkedAt:now()});}
    }));
    return {checked:results.length,failed:results.filter(item=>item.status==='rejected').length};
  }
  return {login,status,updateProfile,createOrder,query,restore,notify,reconcilePending,catalogue};
}
module.exports={createService,USERS,ORDERS,GRANTS};

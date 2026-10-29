const account=require('../../utils/account');
const payment=require('../../utils/member-payment');
const storage=require('../../utils/storage');
Page({
  data:{name:'微信用户',avatarUrl:'',avatarFailed:false,adFree:false,ready:false,payEnv:0,busy:false,hint:''},
  onLoad(){this._destroyed=false;},
  onShow(){
    this._active=true;
    const bar=this.getTabBar&&this.getTabBar();if(bar)bar.setData({selected:2,hidden:false});
    if(!account.isReady()){if(wx.reLaunch)wx.reLaunch({url:'/pages/login/index?next=pages%2Fmine%2Findex'});return;}
    this.update();this.restore(true);
  },
  onHide(){this._active=false;},
  onUnload(){this._active=false;this._destroyed=true;},
  onMembershipChange(){if(this._active)this.update();},
  update(){
    const value=account.getState();if(!value||this._destroyed)return;
    this.setData({name:value.user.name,avatarUrl:value.user.avatarUrl||'',avatarFailed:false,adFree:value.entitlement.adFree,ready:value.catalogue.ready,payEnv:value.catalogue.payEnv||0});
  },
  avatarError(){this.setData({avatarFailed:true});},
  pendingKey(){return this.data.payEnv===1?'account:sandbox:pendingOrder':'account:pendingOrder';},
  pending(){const value=storage.read(this.pendingKey(),null),state=account.getState();return value&&state&&value.owner===state.user.id?value:null;},
  savePending(orderId){storage.write(this.pendingKey(),{owner:account.getState().user.id,orderId});},
  clearPending(){storage.write(this.pendingKey(),null);},
  async verify(orderId,attempts=5){
    for(let i=0;i<attempts;i++){
      if(this._destroyed||!account.isReady())return false;
      const result=await account.query(orderId);this.update();
      if(result.entitlement.adFree){this.clearPending();if(this._active)this.setData({hint:'已开通终生免广告'});return true;}
      if(result.order&&result.order.state==='refunded'){this.clearPending();return false;}
      if(i<attempts-1)await new Promise(resolve=>setTimeout(resolve,1000));
    }
    return false;
  },
  async restore(quiet=false){
    if(this.data.busy||!account.isReady())return;
    this.setData({busy:true,hint:''});
    try{
      await account.refresh(true);this.update();
      const pending=this.pending();if(pending)await this.verify(pending.orderId,1);
      if(!quiet&&this._active)this.setData({hint:account.isAdFree()?'免广告权益已恢复':'当前账户暂无已生效的购买'});
    }catch(err){console.warn('[membership] restore',{code:err.code||'RESTORE_PENDING'});if(!quiet&&this._active)this.setData({hint:'权益暂未确认，请稍后再试'});}
    finally{if(!this._destroyed)this.setData({busy:false});}
  },
  refreshMembership(){this.restore(false);},
  async buy(){
    if(this.data.busy||account.isAdFree()||!account.isReady())return;
    const unsupported=payment.unavailable(wx,this.data.payEnv);if(unsupported){wx.showToast({title:unsupported,icon:'none'});return;}
    this.setData({busy:true,hint:''});
    let orderId='',cancelled=false;
    try{
      await account.refresh(true);this.update();if(account.isAdFree())return;
      const old=this.pending();if(old&&await this.verify(old.orderId,1))return;
      if(!this._active)return;
      const order=await account.createOrder();orderId=order.orderId;this.savePending(orderId);
      if(!this._active)return;
      try{await payment.request(wx,order.payData);}catch(err){
        cancelled=/cancel/i.test(err.errMsg||'');
        if(!cancelled){
          const raw=String(err.errCode||err.code||'PAYMENT_FAILED');
          const code=/^[\w.:-]{1,80}$/.test(raw)?raw:'PAYMENT_FAILED';
          console.error('[membership] client-payment',{code});
          throw Object.assign(Error('微信支付未完成（'+code+'），可点击恢复购买核对订单'),{code});
        }
      }
      const confirmed=await this.verify(orderId,cancelled?1:5);
      if(!confirmed&&this._active)this.setData({hint:cancelled?'已取消支付':'支付结果正在确认，可稍后点击恢复购买'});
    }catch(err){
      let confirmed=false;if(orderId){try{confirmed=await this.verify(orderId,1);}catch(_){} }
      if(!confirmed&&this._active)this.setData({hint:'购买结果待确认，请稍后恢复购买'});
    }finally{if(!this._destroyed)this.setData({busy:false});}
  },
  purchaseInfo(){wx.showModal({title:'终生免广告 · ¥9.90',content:'一次购买，无自动续费。绑定当前微信账户，免除 Banner、插屏及转盘保存激励广告，所有玩法继续免费。重新登录后可恢复购买。退款成功后收回对应权益；iOS 退款由 Apple 审核，其他终端可通过客服申请。',showCancel:false});},
  logout(){if(this.data.busy)return;wx.showModal({title:'退出登录',content:'仅退出账户，不会清除本机转盘和游戏设置。',success:res=>{if(res.confirm){account.logout();wx.reLaunch({url:'/pages/login/index'});}}});}
});

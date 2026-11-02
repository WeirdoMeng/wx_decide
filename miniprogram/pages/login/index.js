const account=require('../../utils/account');
const {destination}=require('../../utils/login-route');
Page({
  data:{busy:false,avatarUrl:'',nickname:'',canChooseAvatar:true,editing:false},
  onLoad(options={}){
    this._next=destination(options.next);
    this.setData({editing:options.mode==='profile',canChooseAvatar:!wx.canIUse||wx.canIUse('button.open-type.chooseAvatar')});
  },
  onShow(){this._active=true;if(account.isReady())this.acceptAccount();},
  onHide(){this._active=false;},
  onUnload(){this._active=false;},
  acceptAccount(){
    const state=account.getState();if(!state||!this._active)return;
    if(!this.data.editing){this.enter();return;}
    this.setData({avatarUrl:this.data.avatarUrl||state.user.avatarUrl||'',nickname:this.data.nickname||(state.user.name==='微信用户'?'':state.user.name)});
  },
  async login(){
    if(this.data.busy)return;this.setData({busy:true});
    try{await account.login();this.acceptAccount();}
    catch(err){console.warn('[login] resume',{code:err.code||'LOGIN_PENDING'});if(this._active)wx.showToast({title:'暂时未完成，请稍后再试',icon:'none'});}
    finally{if(this._active)this.setData({busy:false});}
  },
  chooseAvatar(event){const avatarUrl=event.detail&&event.detail.avatarUrl;if(avatarUrl)this.setData({avatarUrl});},
  nicknameChange(event){this.setData({nickname:event.detail.value||''});},
  avatarError(){this.setData({avatarUrl:''});},
  async submitProfile(event){
    if(this.data.busy||!this.data.editing)return;
    const nickname=String(event.detail.value.nickname||'').trim();
    if(!this.data.avatarUrl||!nickname){wx.showToast({title:'请选择头像并填写昵称',icon:'none'});return;}
    if(!this.data.canChooseAvatar){wx.showToast({title:'请更新微信后继续',icon:'none'});return;}
    this.setData({busy:true});
    try{
      if(!account.isReady())await account.login();
      if(!this._active)return;
      await account.updateProfile(nickname,this.data.avatarUrl);
      if(this._active&&account.isReady())this.enter();
    }catch(err){
      console.warn('[login] profile',{code:err.code||'PROFILE_PENDING'});
      if(this._active)wx.showToast({title:'暂时未完成，请稍后再试',icon:'none'});
    }finally{if(this._active)this.setData({busy:false});}
  },
  browse(){wx.switchTab({url:'/pages/index/index'});},
  enter(){const next=this._next||destination();if(next.tab)wx.switchTab({url:next.url});else wx.reLaunch({url:next.url});}
});

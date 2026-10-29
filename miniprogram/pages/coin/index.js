const sound=require('../../utils/sound');const store=require('../../utils/storage');const visual=require('../../utils/coin-visual');const layout=require('../../utils/layout');
const ads=require('../../utils/ads');
const names=['鎏金·祥云','锦纹金','赛博银','古韵银','黑金秘纹'];
Page({
 data:{skins:names.map((name,index)=>({name,index,image:'/assets/original/coin'+(index+1)+'_heads.png'})),skin:0,flipping:false,result:'',heads:0,tails:0,total:0,scrollLeft:0,heightScale:1,coin:visual.frame(0,0,0),edges:visual.layers(0),edgeHighlight:visual.palettes[0][0]},
 onLoad(){this._active=true;this._adController=ads.controller(()=>this._active);this.sound=sound.createPlayer();this._angle=0;const skin=Math.max(0,Math.min(4,Number(store.read('coin-skin',0))||0));this.setData({skin,scrollLeft:Math.max(0,(skin*80+40)-175),heightScale:layout.metrics().heightScale,edges:visual.layers(skin),edgeHighlight:visual.palettes[skin][0]});},
 onShow(){this._active=true;},
 onHide(){this._active=false;if(this._adController)this._adController.cancel();this._adGate=false;this.cancel();this.sound.destroy();},onUnload(){this._active=false;if(this._adController)this._adController.dispose();this._adGate=false;this.cancel();this.sound.destroy();},
 choose(event){if(this._adGate)return;const skin=Number(event.currentTarget.dataset.index);if(!Number.isInteger(skin)||skin<0||skin>4)return;try{store.write('coin-skin',skin);this.setData({skin,scrollLeft:Math.max(0,(skin*80+40)-175),edges:visual.layers(skin),edgeHighlight:visual.palettes[skin][0]});}catch(_){wx.showToast({title:'保存皮肤失败',icon:'none'});}},
 flip(){
  if(this.data.flipping||this._adGate)return;
  if(ads.shouldOffer('coin')){this._adGate=true;const accepted=this._adController.play(()=>{this._adGate=false;if(this._active)this._startFlip();},{placement:'coin'});if(accepted===false)this._adGate=false;return;}
  this._startFlip();
 },
 _startFlip(){
  if(this.data.flipping)return;this.pending=Math.random()<.5?'heads':'tails';const tau=Math.PI*2,from=this._angle||0,landing=this.pending==='heads'?0:Math.PI;let target=from-from%tau+tau*4+landing;if(target<=from+Math.PI)target+=tau;
  this._from=from;this._target=target;this._started=Date.now();this.setData({flipping:true,result:'',coin:visual.frame(0,from,target)});
  this.interval=setInterval(()=>{const progress=Math.min(1,(Date.now()-this._started)/1600);if(progress>=1)this.finish();else this.setData({coin:visual.frame(progress,from,target)});},16);
  this.timer=setTimeout(()=>this.finish(),1600);
 },
 finish(){clearTimeout(this.timer);clearInterval(this.interval);this.timer=null;this.interval=null;if(!this.data.flipping)return;this._angle=this._target%(Math.PI*2);const heads=this.data.heads+(this.pending==='heads'?1:0),tails=this.data.tails+(this.pending==='tails'?1:0);this.setData({flipping:false,coin:visual.frame(1,this._angle,this._angle),result:this.pending==='heads'?'正面':'反面',heads,tails,total:heads+tails});store.feedback('medium');this.sound.play('finish');},
 cancel(){clearTimeout(this.timer);clearInterval(this.interval);this.timer=null;this.interval=null;if(this.data.flipping)this.setData({flipping:false,result:'',coin:visual.frame(1,this._angle||0,this._angle||0)});},
 stageStart(event){const point=event.touches[0];if(point)this._swipe={x:point.clientX,time:Date.now()};},
 stageEnd(event){if(!this._swipe||this.data.flipping)return;const point=event.changedTouches[0],dx=point?point.clientX-this._swipe.x:0,velocity=dx/Math.max(1,Date.now()-this._swipe.time)*1000;this._swipe=null;if(Math.abs(dx)>20&&Math.abs(velocity)>=120){this._ignoreTapUntil=Date.now()+350;this.choose({currentTarget:{dataset:{index:(this.data.skin+(dx<0?1:-1)+5)%5}}});}},
 stageTap(){if(Date.now()<(this._ignoreTapUntil||0))return;this.flip();},reset(){if(this._adGate)return;this.setData({heads:0,tails:0,total:0});}
});

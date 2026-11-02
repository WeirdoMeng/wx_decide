const ads=require('../../../utils/ads');
const storage=require('../../../utils/storage');
const {DiceAudio}=require('../../audio');
const {DiceRenderer}=require('../../renderer');
const rules=require('../../rules');
Page({
 data:{count:5,choices:[1,2,3,4,5,6],phase:'ready',busy:false,adPending:false,renderReady:false,renderError:false,dice:[],total:0,counts:[],motionEnabled:true,motionAvailable:false,round:0},
 onLoad(){
  this._active=false;this._gone=false;this._adController=ads.controller(()=>this._active&&!this._gone);this._motionHandler=sample=>this._onMotion(sample);this._audio=new DiceAudio(wx);
  this.setData({count:rules.count(storage.read('party:dice-count',5)),motionEnabled:storage.read('party:dice-motion',true)!==false,motionAvailable:!!(wx.startAccelerometer&&wx.onAccelerometerChange&&wx.offAccelerometerChange)});
 },
 onReady(){this.initScene();},
 onShow(){this._active=true;this._syncScene();this._startMotion();},
 _syncScene(){if(this._renderer)try{this._renderer.setState(this._values||[],this.data.phase==='open');}catch(error){this.renderFailed(error);}},
 onHide(){this._deactivate();},
 onUnload(){this._gone=true;this._deactivate();if(this._adController)this._adController.dispose();this._initRevision=(this._initRevision||0)+1;if(this._renderer)this._renderer.dispose();this._renderer=null;if(this._audio)this._audio.dispose();},
 onResize(){this._settleInterrupted();this.initScene();},
 initScene(){
  if(this._gone)return;
  const revision=(this._initRevision||0)+1;this._initRevision=revision;
  if(this._renderer)this._renderer.dispose();this._renderer=null;this.setData({renderReady:false,renderError:false});
  try{wx.createSelectorQuery().in(this).select('#dice-scene').fields({node:true,size:true}).exec(result=>{
   if(this._gone||this._initRevision!==revision)return;
   try{const info=result&&result[0];if(!info||!info.node||!info.width||!info.height)throw Error('canvas unavailable');
    if(!this._sceneBuffer)this._sceneBuffer=wx.getFileSystemManager().readFileSync('dice/assets/scene.bin');
    const device=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
    this._renderer=new DiceRenderer(info.node,this._sceneBuffer,{width:info.width,height:info.height,pixelRatio:device.pixelRatio,onError:error=>this.renderFailed(error)});
    this._renderer.setState(this._values||[],this.data.phase==='open');this.setData({renderReady:true});this._startMotion();
   }catch(error){this.renderFailed(error);}
  });}catch(error){this.renderFailed(error);}
 },
 renderFailed(error){
  console.warn('[dice] renderer',error&&error.message||'unavailable');
  this._settleInterrupted();if(this._renderer)this._renderer.dispose();this._renderer=null;
  this._stopMotion();if(this._audio)this._audio.stop();this.setData({renderReady:false,renderError:true,busy:false});
 },
 chooseCount(event){
  if(!this._active||this.data.busy||this.data.adPending)return;const count=Number(event.currentTarget.dataset.count);if(!this.data.choices.includes(count)||count===this.data.count)return;
  this._buttonAd('diceCount','_changeCount',count);
 },
 _changeCount(count){
  try{storage.write('party:dice-count',count);}catch(_){}
  this._values=null;this.setData({count,phase:'ready',dice:[],counts:[],total:0});this._syncScene();
 },
 shakeButton(){
  if(!this._active||this.data.busy||this.data.adPending||!this.data.renderReady||!this._renderer)return;
  this._buttonAd('diceShake','shake');
 },
 cupButton(){
  if(!this._active||this.data.busy||this.data.adPending||!this._values||!this._renderer||!['covered','open'].includes(this.data.phase))return;
  this._buttonAd(this.data.phase==='open'?'diceClose':'diceOpen','toggleCup');
 },
 _buttonAd(placement,action,value){
  if(!ads.shouldOffer(placement)){this[action](value);return;}
  this.setData({adPending:true});
  const accepted=this._adController.play(()=>{
   this.setData({adPending:false});
   if(this._active&&!this._gone)this[action](value);
  },{placement});
  if(accepted===false)this.setData({adPending:false});
 },
 shake(){
  if(!this._active||this.data.busy||this.data.adPending||!this.data.renderReady||!this._renderer)return;
  this._motionCooldown=Date.now()+2200;this._motionPeaks=0;this._values=null;
  const values=rules.roll(this.data.count);this.setData({phase:'rolling',busy:true,dice:[],counts:[],total:0});storage.feedback('medium');
  this._renderer.roll(values,()=>{
   if(!this._active||this.data.phase!=='rolling')return;
   this._values=values;this.setData({phase:'covered',busy:false,round:this.data.round+1});storage.feedback('light');this._audio.play('dice');
  },()=>{if(this._active)this._audio.play('cup');});
 },
 _reveal(){const values=this._values||[];this.setData({phase:'open',busy:false,dice:values.map((value,index)=>({index,value})),...rules.summary(values)});},
 toggleCup(){
  if(!this._active||this.data.busy||this.data.adPending||!this._values||!this._renderer||!['covered','open'].includes(this.data.phase))return;
  this._motionCooldown=Date.now()+1200;storage.feedback('light');
  if(this.data.phase==='open'){
   this.setData({phase:'closing',busy:true});this._renderer.close(()=>{if(!this._active||this.data.phase!=='closing')return;this.setData({phase:'covered',busy:false,dice:[],counts:[],total:0});this._audio.play('table');});
  }else{
   this.setData({phase:'opening',busy:true});this._renderer.open(()=>{if(!this._active||this.data.phase!=='opening')return;this._reveal();this._audio.play('dice');});
  }
 },
 sceneTouchStart(event){const p=event.touches&&event.touches[0];if(p)this._touchY=p.clientY;},
 sceneTouchEnd(event){const p=event.changedTouches&&event.changedTouches[0];if(p&&Number.isFinite(this._touchY)){const delta=p.clientY-this._touchY;if((delta<-38&&this.data.phase==='covered')||(delta>38&&this.data.phase==='open')){this._ignoreTapUntil=Date.now()+400;this.toggleCup();}}this._touchY=null;},
 sceneTouchCancel(){this._touchY=null;},
 sceneTap(){if(Date.now()<(this._ignoreTapUntil||0))return;this.toggleCup();},
 toggleMotion(){if(!this.data.motionAvailable)return;const enabled=!this.data.motionEnabled;this.setData({motionEnabled:enabled});try{storage.write('party:dice-motion',enabled);}catch(_){}if(enabled)this._startMotion();else this._stopMotion();},
 _startMotion(){
  if(!this._active||!this.data.renderReady||!this.data.motionEnabled||!this.data.motionAvailable||this._listening)return;
  this._previousMotion=null;this._motionPeaks=0;this._motionCooldown=Date.now()+600;this._listening=true;
  wx.onAccelerometerChange(this._motionHandler);
  wx.startAccelerometer({interval:'game',fail:()=>{this._stopMotion();if(!this._gone)this.setData({motionAvailable:false});}});
 },
 _onMotion(sample){
  if(!this._active||!this._listening||!this.data.motionEnabled)return;
  const previous=this._previousMotion;this._previousMotion=sample;const now=Date.now();
  if(now<(this._motionCooldown||0)||this.data.busy)return;
  if(rules.motionDelta(previous,sample)<1.8)return;
  this._motionPeaks=now-(this._lastPeak||0)<400?this._motionPeaks+1:1;this._lastPeak=now;
  if(this._motionPeaks>=2)this.shake();
 },
 _stopMotion(){if(this._listening){wx.offAccelerometerChange(this._motionHandler);if(wx.stopAccelerometer)wx.stopAccelerometer({fail(){}});}this._listening=false;this._previousMotion=null;this._motionPeaks=0;},
 _settleInterrupted(){
  if(this._renderer)this._renderer.cancel();
  if(this.data.phase==='opening')this._reveal();
  else if(this.data.phase==='closing')this.setData({phase:'covered',busy:false,dice:[],counts:[],total:0});
  else if(this.data.phase==='rolling'){this._values=null;this.setData({phase:'ready',busy:false,dice:[],counts:[],total:0});}
 },
 _deactivate(){this._active=false;if(this._adController)this._adController.cancel();this.setData({adPending:false});this._touchY=null;this._stopMotion();this._settleInterrupted();if(this._audio)this._audio.stop();},
 showHelp(){wx.showModal({title:'摇骰子怎么玩',content:'选择 1–6 颗骰子，点击“摇一摇”或摇动手机。摇动结束后点画布或“开盅”查看点数，也可以上滑开盅、下滑盖盅。盖盅不会改变点数，重新摇动才开始新一轮。声音与震动遵循聚会设置。',showCancel:false});}
});

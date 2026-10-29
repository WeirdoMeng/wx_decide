const {BilliardsSession,beginRearAimDrag,updateRearAimDirection}=require('../../core');
const {BilliardsRenderer}=require('../../renderer');
const {BilliardsAudio}=require('../../audio');
const storage=require('../../../utils/storage');
const ads=require('../../../utils/ads');
const {createDiagnostics}=require('../../diagnostics');
const {loadSceneAssets}=require('../../scene-assets');
Page({
  data:{canvasHud:true,mode:'eight',title:'3D 黑8',ready:false,error:'',paused:false,sound:true,top:false,ai:false,difficulty:'normal',difficultyLabel:'普通',activePlayer:0,scores:[0,0],targetLabel:'开球',message:'正在准备球桌…',canShoot:false,power:42,ballInHand:false,moving:false,thinking:false,finished:false,winnerLabel:'',redsRemaining:15,nominate:false,color:'black',colors:[{id:'yellow',label:'黄'},{id:'green',label:'绿'},{id:'brown',label:'棕'},{id:'blue',label:'蓝'},{id:'pink',label:'粉'},{id:'black',label:'黑'}],spinX:0,spinY:0,spinLabel:'中杆'},
  onLoad(options){this._adController=ads.controller(()=>!this._gone&&this._visible);this._menu=null;this._gone=false;this._visible=true;this._mode=options.mode==='snooker'?'snooker':'eight';this._diagnostics=createDiagnostics(wx,this._mode);this.setData({mode:this._mode,title:this._mode==='snooker'?'3D 斯诺克':'3D 黑8',sound:storage.getSettings().sound});},
  onReady(){this.initTable();},
  initTable(){
    if(this._renderer||this._loading||this._gone)return;
    const token={};this._initToken=token;this._loading=true;
    const current=()=>!this._gone&&this._initToken===token;
    this.setData({error:''});this._diagnostics.mark('query-canvas');
    wx.createSelectorQuery().in(this).select('#table').fields({node:true,size:true,rect:true}).exec(result=>{
      if(!current())return;
      const info=result&&result[0];if(!info||!info.node||!info.width||!info.height){this.tableInitFailed(new Error('球桌画布未就绪，请重新进入'));return;}
      this._canvas=info.node;this._rect=info;
      this._diagnostics.mark('canvas-node',{width:info.width,height:info.height,hasGetContext:typeof info.node.getContext,hasRAF:typeof info.node.requestAnimationFrame});
      this._assetTask=loadSceneAssets(info.node,wx,{
        onStage:(stage,details)=>{if(current())this._diagnostics.mark(stage,details);},
        onError:error=>{if(current())this.tableInitFailed(error);},
        onSuccess:assets=>{
          if(!current())return;
          this._assetTask=null;this._loading=false;
          try{
            const device=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
            this._session=new BilliardsSession(this._mode);this._audio=new BilliardsAudio();this._audio.setEnabled(this.data.sound);
            this._session.onChange=state=>this.syncState(state);this._session.onSound=(type,strength)=>this._audio.play(type,strength);
            this._diagnostics.mark('offscreen-2d-create');const hudCanvas=wx.createOffscreenCanvas({type:'2d',width:Math.round(info.width),height:Math.round(info.height)});
            this._diagnostics.mark('offscreen-2d-probe');const context=hudCanvas.getContext('2d');if(!context||typeof context.getImageData!=='function')throw new Error('离屏2D缺少getImageData');context.clearRect(0,0,1,1);const probe=context.getImageData(0,0,1,1);if(!probe||!probe.data||probe.data.length!==4)throw new Error('离屏2D像素读回失败');
            this._diagnostics.mark('offscreen-2d-ready',{pixelType:probe.data.constructor&&probe.data.constructor.name});
            this._renderer=new BilliardsRenderer(info.node,{width:info.width,height:info.height,pixelRatio:device.pixelRatio,mode:this._mode,session:this._session,assets,hudCanvas,onHudAction:action=>this.handleHudAction(action),onStage:(stage,details)=>this._diagnostics.mark(stage,details)});this._renderer.setHudSound(this.data.sound);this.updateHudSafeArea(this._renderer,info);
            this.syncState(this._session.snapshot());this.setData({ready:true});if(!this._visible){this._session.pause();this._audio.setPaused(true);}else this.startLoop();
          }catch(error){this.tableInitFailed(error);}
        }
      });
    });
  },
  cancelAssetLoad(){this._initToken=null;this._loading=false;if(this._assetTask)this._assetTask.cancel();this._assetTask=null;},
  tableInitFailed(error){console.error('[billiards] init',error);this.cancelAssetLoad();this.stopLoop();if(this._renderer)this._renderer.dispose();if(this._session)this._session.dispose();if(this._audio)this._audio.dispose();this._renderer=null;this._session=null;this._audio=null;this._canvas=null;this._rect=null;this.setData({ready:false});this.showRenderFailure('台球初始化失败',error);},
  syncState(state){if(this._gone)return;if(state.phase==='finished'&&!this.data.finished)ads.recordRound();const winner=state.winner;this.setData({paused:state.paused,ai:state.ai,difficulty:state.difficulty,difficultyLabel:{easy:'简单',normal:'普通',hard:'困难'}[state.difficulty],activePlayer:state.activePlayer,scores:state.players,targetLabel:state.targetLabel,message:state.message,canShoot:state.canShoot&&!this.data.top,power:state.power,ballInHand:state.ballInHand,moving:state.moving,thinking:state.thinking,finished:state.phase==='finished',winnerLabel:winner===null?'本局平局':(winner===1&&state.ai?'AI':'玩家 '+(winner+1))+' 获胜',redsRemaining:state.redsRemaining||0,nominate:this._mode==='snooker'&&state.phase==='reds'&&state.target!=='red',color:state.selectedColor});},
  startLoop(){if(!this._canvas||this._frame!==undefined||this._gone||!this._visible)return;this._last=0;const loop=now=>{this._frame=undefined;if(this._gone||!this._visible||!this._renderer)return;try{const time=typeof now==='number'?now:Date.now();const dt=this._last?Math.min(.05,(time-this._last)/1000):0;this._last=time;this._renderer.render(dt,time);this._frame=this._canvas.requestAnimationFrame(loop);}catch(error){console.error('[billiards] render',error);this._session.pause();this._audio.setPaused(true);this.showRenderFailure('台球渲染中断',error);}};this._frame=this._canvas.requestAnimationFrame(loop);},
  stopLoop(){this.closeMenu();if(this._frame!==undefined&&this._canvas)this._canvas.cancelAnimationFrame(this._frame);this._frame=undefined;this._last=0;this._drag=null;this._controlGesture=null;this._hudCapture=false;this._placement=null;if(this._renderer){this._renderer.placementPreview();this._renderer.hudPointer('cancel',0,0);}},
  onShow(){this._visible=true;if(this._renderer){if(!storage.getSettings().sound){this.setData({sound:false});this._audio.setEnabled(false);this._renderer.setHudSound(false);}this.startLoop();this._session.notify();}},
  onHide(){this._visible=false;if(this._adController)this._adController.cancel();this._adGate=false;this.stopLoop();if(this._session)this._session.pause();if(this._audio)this._audio.setPaused(true);},
  onUnload(){if(this._adController)this._adController.dispose();this.cancelAssetLoad();this._gone=true;this._visible=false;this.stopLoop();if(this._session)this._session.dispose();if(this._audio)this._audio.dispose();if(this._renderer)this._renderer.dispose();this._renderer=null;},
  updateHudSafeArea(renderer,rect){
    if(typeof renderer.setHudCapsuleBottom!=='function')return;
    let capsule;try{capsule=wx.getMenuButtonBoundingClientRect&&wx.getMenuButtonBoundingClientRect();}catch(_){}
    const bottom=capsule&&capsule.width>0&&capsule.left>(rect.left||0)+rect.width/2?Math.max(0,capsule.bottom-(rect.top||0)):0;
    renderer.setHudCapsuleBottom(bottom);
  },
  onResize(){const renderer=this._renderer;if(!renderer)return;wx.createSelectorQuery().in(this).select('#table').fields({size:true,rect:true}).exec(result=>{if(this._gone||this._renderer!==renderer||!result||!result[0]||!result[0].width||!result[0].height)return;this._rect=result[0];renderer.resize(result[0].width,result[0].height);this.updateHudSafeArea(renderer,result[0]);});},
  point(event,end){const touch=(end?event.changedTouches:event.touches)||[];const t=touch[0];if(!t)return null;return{x:typeof t.x==='number'?t.x:t.clientX-(this._rect.left||0),y:typeof t.y==='number'?t.y:t.clientY-(this._rect.top||0)};},
  touchStart(event){
    if(this._gone||!this._session||!this._renderer||event.touches.length!==1)return;
    const p=this.point(event);if(!p)return;
    if(this._renderer.hudPointer('down',p.x,p.y)){this._hudCapture=true;this._drag=null;return;}
    if(this._menu||!this._session.canControl())return;
    if(this.data.top){this._drag={...p,view:true};return;}
    const point=this._renderer.groundPoint(p.x,p.y,!this._session.ballInHand);
    if(this._session.ballInHand){this._drag={placement:true};this.updatePlacement(point);return;}
    const angle=this._session.angle,rear=beginRearAimDrag(this._session.physics.cueBall.position,{x:Math.cos(angle),z:Math.sin(angle)},point);
    if(!rear){this._session.message='请拖动球杆后端，在母球后方按住再缓慢滑动';this._session.notify();return;}
    this._drag={rear};this._session.message='正在微调方向，松手后方向保持';this._session.notify();
  },
  updatePlacement(point){const valid=this._session.physics.canPlaceCue(point);this._placement=valid?point:null;this._renderer.placementPreview(this._placement||undefined);this._session.message=valid?'松手确认母球位置，继续拖动可微调':'这里不能摆放母球，请避开其他球';this._session.notify();},
  touchMove(event){
    if(this._gone||!this._session||!this._renderer)return;
    const p=this.point(event);if(!p)return;
    if(this._hudCapture){this._renderer.hudPointer('move',p.x,p.y);return;}
    if(!this._drag||event.touches.length!==1)return;
    if(this._drag.view){this._renderer.orbit(p.x-this._drag.x,p.y-this._drag.y);this._drag={...p,view:true};return;}
    const point=this._renderer.groundPoint(p.x,p.y,!this._session.ballInHand);
    if(this._drag.placement){this.updatePlacement(point);return;}
    const direction=updateRearAimDirection(this._drag.rear,this._session.physics.cueBall.position,point);this._session.setAngle(Math.atan2(direction.z,direction.x));
  },
  touchEnd(event){
    if(this._gone||!this._session||!this._renderer){this._drag=null;this._hudCapture=false;return;}
    if(this._hudCapture){this._hudCapture=false;const point=this.point(event,true);if(point)this._renderer.hudPointer('up',point.x,point.y);else this._renderer.hudPointer('cancel',0,0);return;}
    const drag=this._drag;this._drag=null;if(!drag)return;
    if(drag.placement&&this._placement)this._session.placeCue(this._placement);
    this._placement=null;this._renderer.placementPreview();
  },
  touchCancel(){this._drag=null;this._hudCapture=false;this._placement=null;if(this._renderer){this._renderer.placementPreview();this._renderer.hudPointer('cancel',0,0);}},
  handleHudAction(item){if(this._gone)return;const action=item.action,value=item.value;if(action==='menu-close'){this.closeMenu();return;}if(action==='menu-select'){this.selectMenu(value);return;}if(this._menu)return;if(action==='color-picker'){this.openMenu('color');return;}if(action==='spin-pad'){if(this._session.snapshot().canShoot){this._session.setSpin(item.x,item.y);this.setData({spinX:Math.round(item.x*100),spinY:Math.round(item.y*100)});}return;}if(action==='power'){this._session.setPower((8+Math.round(Number(value)*92))/100);return;}if(action==='spin-x'||action==='spin-y'){if(!this._session.snapshot().canShoot)return;const spin=(Math.round(Number(value)*200)-100)/100;this._session.setSpin(action==='spin-x'?spin:this._session.sideSpin,action==='spin-y'?spin:this._session.followSpin);this.setData({spinX:Math.round(this._session.sideSpin*100),spinY:Math.round(this._session.followSpin*100)});return;}if(action==='fine-'||action==='fine+'){this.fineAim({currentTarget:{dataset:{dir:action==='fine-'?-1:1}}});return;}if(action==='color'){this.selectColor({currentTarget:{dataset:{color:value}}});return;}const method={exit:'exit',pause:'pause',resume:'resume',restart:'restart',shoot:'shoot',help:'help',opponent:'changeOpponent',difficulty:'changeDifficulty',view:'toggleView',sound:'toggleSound'}[action];if(method)this[method]();},
  shoot(){if(this._session&&!this.data.top)this._session.shoot();},
  powerChange(event){if(this._session)this._session.setPower(Number(event.detail.value)/100);},
  controlPoint(event){const touch=(event.touches&&event.touches[0])||(event.changedTouches&&event.changedTouches[0]);return touch&&typeof touch.clientX==='number'?touch.clientX:null;},
  controlTouchStart(event){
    if(!this._session||!this._session.canControl())return;
    const axis=event.currentTarget.dataset.axis;
    if(axis!=='power'&&!this._session.snapshot().canShoot)return;
    const x=this.controlPoint(event);if(x===null)return;
    const gesture={axis,x,active:true,rect:null};this._controlGesture=gesture;
    wx.createSelectorQuery().in(this).select('#'+axis+'-track').boundingClientRect(rect=>{if(this._gone||this._controlGesture!==gesture||!rect)return;gesture.rect=rect;this.applyControl(gesture);if(!gesture.active)this._controlGesture=null;}).exec();
  },
  controlTouchMove(event){const gesture=this._controlGesture;if(!gesture||!gesture.active)return;const x=this.controlPoint(event);if(x!==null){gesture.x=x;this.applyControl(gesture);}},
  controlTouchEnd(event){const gesture=this._controlGesture;if(!gesture)return;const x=this.controlPoint(event);if(x!==null)gesture.x=x;gesture.active=false;this.applyControl(gesture);if(gesture.rect)this._controlGesture=null;},
  controlTouchCancel(){this._controlGesture=null;},
  applyControl(gesture){
    if(!gesture.rect||!this._session||!this._session.canControl())return;
    const fraction=Math.max(0,Math.min(1,(gesture.x-gesture.rect.left-7)/Math.max(1,gesture.rect.width-14)));
    if(gesture.axis==='power')this._session.setPower((8+Math.round(fraction*92))/100);
    else if(this._session.snapshot().canShoot){const value=Math.round(fraction*200-100),x=gesture.axis==='x'?value/100:this._session.sideSpin,y=gesture.axis==='y'?value/100:this._session.followSpin;this._session.setSpin(x,y);this.setData({[gesture.axis==='x'?'spinX':'spinY']:value,spinLabel:'左右塞 '+Math.round(x*100)+' · 高低杆 '+Math.round(y*100)});}
  },
  fineAim(event){if(this._session)this._session.setAngle(this._session.angle+Number(event.currentTarget.dataset.dir)*.005);},
  spinChange(event){if(!this._session||!this._session.canControl())return;const {axis}=event.currentTarget.dataset;const value=Number(event.detail.value)/100;this._session.setSpin(axis==='x'?value:this._session.sideSpin,axis==='y'?value:this._session.followSpin);this.setData({[axis==='x'?'spinX':'spinY']:Number(event.detail.value),spinLabel:'左右塞 '+Math.round(this._session.sideSpin*100)+' · 高低杆 '+Math.round(this._session.followSpin*100)});},
  resetSpin(){if(this._session){this._session.setSpin(0,0);this.setData({spinX:0,spinY:0,spinLabel:'中杆'});}},
  pause(){this.closeMenu();if(!this._session)return;this._session.pause();this._audio.setPaused(true);},
  resume(){if(!this._session)return;this._session.resume();this._audio.setPaused(false);this.startLoop();},
  restart(){if(!this._session||this._adGate)return;if(this.data.finished&&this._adController&&ads.shouldOffer('billiards')){this._adGate=true;const accepted=this._adController.play(()=>{this._adGate=false;if(!this._gone&&this._visible)this._restartRound();},{placement:'billiards'});if(accepted===false)this._adGate=false;return;}this._restartRound();},
  _restartRound(){if(!this._session)return;this.closeMenu();this._drag=null;this._placement=null;this._renderer.placementPreview();this._renderer.resetView();this.setData({top:false,spinX:0,spinY:0,spinLabel:'中杆'});this._session.restart();this._session.setPower(.42);this._audio.setPaused(false);},
  openMenu(kind){if(!this._session||!this._renderer||this._session.paused||this._session.snapshot().phase==='finished')return;if(kind==='difficulty'&&!this._session.ai)return;if(kind==='color'&&(!this._session.canControl()||!this.data.nominate))return;this._drag=null;this._placement=null;this._renderer.placementPreview();this._menu=kind;this._renderer.setHudMenu(kind);},
  closeMenu(){this._menu=null;if(this._renderer)this._renderer.setHudMenu(null);},
  selectMenu(value){const kind=this._menu;if(!kind||!this._session)return;if(kind==='mode'&&['local','ai'].includes(value))this._session.setOpponent(value==='ai');else if(kind==='difficulty'&&['easy','normal','hard'].includes(value))this._session.setDifficulty(value);else if(kind==='color'&&['yellow','green','brown','blue','pink','black'].includes(value))this._session.nominate(value);else return;this.closeMenu();},
  changeOpponent(){this.openMenu('mode');},
  changeDifficulty(){this.openMenu('difficulty');},
  selectColor(event){if(this._session)this._session.nominate(event.currentTarget.dataset.color);},
  toggleView(){if(this._renderer&&this._session.canControl()){const top=!this.data.top;this._drag=null;this._renderer.placementPreview();this._renderer.setView(top);this.setData({top});this._session.message=top?'自由观察球桌，拖动可环绕查看任意角度':'方向已锁定，按住球杆后端拖动瞄准';this._session.notify();}},
  toggleSound(){if(!this.data.sound&&!storage.getSettings().sound){wx.showToast({title:'请先在聚会设置中开启声音',icon:'none'});return;}const sound=!this.data.sound;this.setData({sound});if(this._audio)this._audio.setEnabled(sound);if(this._renderer)this._renderer.setHudSound(sound);},
  help(){wx.showModal({title:this.data.title+' · 玩法',showCancel:false,content:this._mode==='eight'?'按住球杆后端拖动微调，调好力度后击球。全色 1–7、花色 9–15；开球后首次合法进球分组，清完自己的球再打黑8。犯规后对手可在全台点击摆放母球。黑8提前入袋或与母球同时入袋判负；开球黑8复位。未采用指袋规则。':'按住球杆后端拖动微调。先红球，再指定彩球，交替击打；红球清空后按黄绿棕蓝粉黑清彩。合法进球继续击球，犯规为对手加分（至少 4 分）。母球落袋后在左侧 D 区点击摆球。本地双人或 AI 均可游玩。'});},
  exit(){wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/party/index'})});},
  showRenderFailure(message,error){this.setData({error:message});if(this._diagnostics)this._diagnostics.fail(error||new Error(message));const content=this._diagnostics?this._diagnostics.summary():message;console.error('[billiards diagnostic]',this._diagnostics?this._diagnostics.text():content);wx.showModal({title:message,content:content+'\n诊断仅保存在本机，可复制后反馈。',confirmText:'复制诊断',cancelText:'其他操作',success:result=>{if(this._gone)return;if(result.confirm)this.copyDiagnostics();else this.failureActions();}});},
  copyDiagnostics(){if(!this._diagnostics)return;wx.setClipboardData({data:this._diagnostics.text(),success:()=>{if(!this._gone)this.failureActions();},fail:()=>wx.showToast({title:'复制失败，请重试',icon:'none'})});},
  failureActions(){wx.showActionSheet({itemList:['重试球桌','返回聚会'],success:result=>{if(this._gone)return;if(result.tapIndex===0)this.retry();else this.exit();}});},
  retry(){this.cancelAssetLoad();this.stopLoop();if(this._session)this._session.dispose();if(this._audio)this._audio.dispose();if(this._renderer)this._renderer.dispose();this._renderer=null;this._session=null;this._audio=null;this.setData({ready:false,error:'',top:false});this.initTable();}
});

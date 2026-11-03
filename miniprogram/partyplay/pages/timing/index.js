const storage=require('../../../utils/storage');
const ads=require('../../../utils/ads');
const {createAudio}=require('../../audio');
const {rankTiming,timingClock}=require('../../rules');
Page({
 data:{phase:'setup',target:10,targets:[5,10,15],multi:false,players:2,rounds:1,roundOptions:[1,3],clock:'00:00.000',clockMinutes:'00',clockSeconds:'00',clockMillis:'000',clockHidden:false,resultMinutes:'00',resultSeconds:'00',resultMillis:'000',hideHint:'显示1秒后隐藏读秒',turnLabel:'单人练习',elapsedText:'',errorText:'',direction:'',differenceText:'',ranking:[],attempts:[],final:false,adPending:false,best:'',isBest:false,customTarget:false,detailTab:'ranking',detailPage:0,detailPages:1,detailRows:[]},
 onLoad(){this._active=false;this._gone=false;this._audio=createAudio();this._ads=ads.controller(()=>this._active&&!this._gone);
  let performance;try{performance=wx.getPerformance&&wx.getPerformance();}catch(_){}this._now=performance&&typeof performance.now==='function'?()=>performance.now():()=>Date.now();this._readBest();},
 onShow(){this._active=true;},
 onHide(){this._active=false;this._clearTimer();if(this.data.phase==='running')this.setData({phase:'invalid'});if(this._audio)this._audio.stop();if(this._ads)this._ads.cancel();this.setData({adPending:false});},
 onUnload(){this._gone=true;this.onHide();if(this._ads)this._ads.dispose();},
 choose(event){if(this.data.phase!=='setup')return;const {field,value}=event.currentTarget.dataset,n=Number(value);if(field==='target'&&this.data.targets.includes(n)){this.setData({target:n,customTarget:false});this._readBest();}else if(field==='rounds'&&this.data.roundOptions.includes(n))this.setData({rounds:n});},
 customDuration(){
  if(this.data.phase!=='setup')return;wx.showModal({title:'自定义目标时长',editable:true,content:String(this.data.target),placeholderText:'输入1–300秒的整数',confirmText:'确定',success:res=>{
   if(!res.confirm||!this._active||this.data.phase!=='setup')return;const raw=String(res.content||'').trim(),target=Number(raw);
   if(!/^\d{1,3}$/.test(raw)||target<1||target>300){wx.showToast({title:'请输入1–300秒的整数',icon:'none'});return;}
   this.setData({target,customTarget:true});this._readBest();
  }});
 },
 _hideAfter(){return this.data.target<=2?0:Math.min(1000,this.data.target*200);},
 _clock(elapsed){const hidden=this.data.phase==='running'&&elapsed>=this._hideAfter();if(hidden){if(!this.data.clockHidden)this.setData({clock:'···',clockHidden:true});return;}const value=timingClock(elapsed);this.setData({clock:value.text,clockMinutes:value.minutes,clockSeconds:value.seconds,clockMillis:value.milliseconds,clockHidden:false});},
 _limit(){return Math.max(60000,(this.data.target+10)*1000);},
 toggleMulti(){if(this.data.phase==='setup')this.setData({multi:!this.data.multi});},
 playersChange(event){if(this.data.phase!=='setup')return;const n=this.data.players+Number(event.currentTarget.dataset.delta);if(Number.isInteger(n)&&n>=2&&n<=8)this.setData({players:n});},
 _readBest(){const ms=storage.read('party:timing-best:'+this.data.target,null);this.setData({hideHint:this._hideAfter()===0?'开始后立即隐藏读秒':'显示'+this._hideAfter()/1000+'秒后隐藏读秒',best:typeof ms==='number'&&Number.isFinite(ms)&&ms>=0?(ms/1000).toFixed(3):''});},
 startMatch(){if(!this._active||this.data.phase!=='setup'||this.data.adPending)return;this._newMatch();},
 _newMatch(){this._turn=0;this._attempts=[];this.setData({attempts:[],ranking:[],final:false,isBest:false});this._ready();},
 _ready(){this.setData({phase:'ready',turnLabel:this.data.multi?'玩家 '+(this._turn%this.data.players+1)+' · 第 '+(Math.floor(this._turn/this.data.players)+1)+' / '+this.data.rounds+' 轮':'单人练习'});this._clock(0);},
 press(){
  if(!this._active||this.data.adPending)return;
  if(this.data.phase==='running'){this._stop();return;}
  if(this.data.phase!=='ready')return;
  this._started=this._now();this.setData({phase:'running'});this._clock(0);
  // 隐藏后不提供节奏动画、震动或音效；按停时用实际经过时间计算。
  this._timer=setInterval(()=>{const elapsed=this._now()-this._started;if(elapsed>=this._limit()){this._clearTimer();this.setData({phase:'invalid'});}else this._clock(elapsed);},33);
 },
 _stop(){
  const elapsed=this._now()-this._started;this._clearTimer();
  if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=this._limit()){this.setData({phase:'invalid'});return;}
  const formatted=timingClock(elapsed);this.setData({resultMinutes:formatted.minutes,resultSeconds:formatted.seconds,resultMillis:formatted.milliseconds});
  const error=elapsed-this.data.target*1000,item={key:this._turn,player:this.data.multi?this._turn%this.data.players:0,elapsed,error,elapsedText:(elapsed/1000).toFixed(3),errorText:(Math.abs(error)/1000).toFixed(3)};
  this._attempts.push(item);const final=!this.data.multi||this._turn+1>=this.data.players*this.data.rounds;
  const old=storage.read('party:timing-best:'+this.data.target,null),isBest=typeof old!=='number'||!Number.isFinite(old)||Math.abs(error)<old;
  if(isBest){try{storage.write('party:timing-best:'+this.data.target,Math.abs(error));}catch(_){}}this._readBest();
  this.setData({phase:'result',elapsedText:item.elapsedText,errorText:item.errorText,direction:Math.round(error)===0?'正中目标':error<0?'提前按停':'超时按停',differenceText:Math.round(error)===0?'正好命中目标':error<0?'提前 '+item.errorText+' 秒按停':'超出目标 '+item.errorText+' 秒',final,isBest,attempts:this._attempts.map(score=>({...score,name:this.data.multi?'玩家 '+(score.player+1):'本次挑战'})),ranking:final&&this.data.multi?rankTiming(this._attempts,this.data.players,this.data.rounds):[]});
  this._detailPage=0;this.setData({detailTab:final&&this.data.multi?'ranking':'attempts'});this._updateDetails();storage.feedback('medium');this._audio.play('finish');
 },
 next(){if(!this._active||this.data.phase!=='result'||this.data.final)return;this._turn++;this._ready();},
 retry(){if(this._active&&this.data.phase==='invalid')this._ready();},
 again(){
  if(!this._active||this.data.phase!=='result'||!this.data.final||this.data.adPending)return;
  const action=()=>{this.setData({adPending:false});if(this._active&&!this._gone)this._newMatch();};
  if(!ads.shouldOffer('timingReplay')){action();return;}this.setData({adPending:true});if(this._ads.play(action,{placement:'timingReplay'})===false)this.setData({adPending:false});
 },
 settings(){if(!this.data.adPending){this._clearTimer();this.setData({phase:'setup'});}},
 detailTab(event){if(!['ranking','attempts'].includes(event.currentTarget.dataset.tab))return;this._detailPage=0;this.setData({detailTab:event.currentTarget.dataset.tab});this._updateDetails();},
 detailPage(event){this._detailPage=(this._detailPage||0)+Number(event.currentTarget.dataset.delta);this._updateDetails();},
 _updateDetails(){
  const rows=this.data.detailTab==='ranking'?this.data.ranking.map(item=>({key:item.player,title:item.rank+' · '+item.name,value:item.errorText+' 秒误差'})):this.data.attempts.map(item=>({key:item.key,title:item.name,value:item.elapsedText+' 秒',extra:'误差 '+item.errorText+' 秒'}));
  const pages=Math.max(1,Math.ceil(rows.length/4));this._detailPage=Math.max(0,Math.min(pages-1,this._detailPage||0));this.setData({detailPage:this._detailPage,detailPages:pages,detailRows:rows.slice(this._detailPage*4,this._detailPage*4+4)});
 },
 _clearTimer(){if(this._timer){clearInterval(this._timer);this._timer=null;}},
 goBack(){if(this.data.adPending)return;if(['ready','running','invalid'].includes(this.data.phase)||(this.data.phase==='result'&&!this.data.final)){if(this.data.phase==='running'){this._clearTimer();this.setData({phase:'invalid'});}wx.showModal({title:'退出本场挑战？',content:'未完成的比赛成绩不会保留。',success:res=>{if(res.confirm)wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/party/index'})});}});}else wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/party/index'})});},
 showHelp(){if(this.data.phase==='running'){this._clearTimer();this.setData({phase:'invalid'});}wx.showModal({title:'十秒挑战',content:'点击开始，短时目标开始后立即隐藏，其他目标只短暂显示读秒后隐藏，凭感觉在目标时刻按停。越接近目标越好，提前和超时按相同误差计算。多人模式轮流挑战，多轮按平均误差排名，同分并列。计时中切后台或查看说明，本次作废，可重新挑战。',showCancel:false});}
});

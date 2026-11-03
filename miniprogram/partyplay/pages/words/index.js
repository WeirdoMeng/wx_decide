const storage=require('../../../utils/storage');
const ads=require('../../../utils/ads');
const {createAudio}=require('../../audio');
const {categories,categoriesFor}=require('../../words');
const rules=require('../../rules');
Page({
 data:{mode:'heads',title:'头顶猜词',phase:'setup',categories:[{key:'mixed',title:'混合题库'}].concat(categories.map(({key,title})=>({key,title}))),category:'mixed',duration:60,durations:[60,90,120],grouped:false,teamCount:2,teamCounts:[2,3,4],rounds:2,roundChoices:[1,2,3],teams:[{key:'team1',name:'一队'},{key:'team2',name:'二队'},{key:'team3',name:'三队'},{key:'team4',name:'四队'}],seconds:60,countdown:3,word:'',wordCategory:'',correct:0,skipped:0,history:[],teamName:'',turnLabel:'',final:false,ranking:[],matchRounds:[],adPending:false,detailTab:'words',detailPage:0,detailPages:1,detailRows:[]},
 onLoad(options={}){
  this._gone=false;this._active=false;this._turn=0;
  const mode=options.mode==='charades'?'charades':'heads';this._seenKey='party:word-seen:'+mode;this._seen=storage.read(this._seenKey,[]);if(!Array.isArray(this._seen))this._seen=[];this.setData({mode,title:mode==='heads'?'头顶猜词':'你比我猜',categories:[{key:'mixed',title:'混合题库'}].concat(categoriesFor(mode).map(({key,title})=>({key,title})))});
  this._audio=createAudio();this._ads=ads.controller(()=>this._active&&!this._gone);
 },
 onShow(){this._active=true;},
 onHide(){this._active=false;this.pause();if(this._ads)this._ads.cancel();this.setData({adPending:false});if(this._audio)this._audio.stop();},
 onUnload(){this._gone=true;this.onHide();if(this._ads)this._ads.dispose();},
 choose(event){
  if(this.data.phase!=='setup'||this.data.adPending)return;
  const {field,value}=event.currentTarget.dataset;
  if(field==='category'&&this.data.categories.some(item=>item.key===value))this.setData({category:value});
  if(field==='duration'&&this.data.durations.includes(Number(value)))this.setData({duration:Number(value)});
  if(field==='teamCount'&&this.data.teamCounts.includes(Number(value)))this.setData({teamCount:Number(value)});
  if(field==='rounds'&&this.data.roundChoices.includes(Number(value)))this.setData({rounds:Number(value)});
 },
 toggleGrouped(){if(this.data.phase==='setup')this.setData({grouped:!this.data.grouped});},
 teamCountPick(event){this.choose({currentTarget:{dataset:{field:'teamCount',value:this.data.teamCounts[Number(event.detail.value)]}}});},
 roundsPick(event){this.choose({currentTarget:{dataset:{field:'rounds',value:this.data.roundChoices[Number(event.detail.value)]}}});},
 renameTeam(event){const index=Number(event.currentTarget.dataset.index);if(this.data.phase!=='setup'||!this.data.teams[index])return;wx.showModal({title:'修改队名',editable:true,content:this.data.teams[index].name,placeholderText:'最多8个字',success:res=>{if(res.confirm&&this._active&&this.data.phase==='setup')this.teamNameInput({currentTarget:{dataset:{index}},detail:{value:String(res.content||'').trim()}});}});},
 editTeamNames(){if(this.data.phase!=='setup'||!this.data.grouped)return;wx.showActionSheet({itemList:this.data.teams.slice(0,this.data.teamCount).map((team,index)=>team.name||'队伍 '+(index+1)),success:res=>{if(this._active&&this.data.phase==='setup')this.renameTeam({currentTarget:{dataset:{index:res.tapIndex}}});}});},
 teamNameInput(event){const index=Number(event.currentTarget.dataset.index);if(this.data.phase!=='setup'||index<0||index>3)return;const teams=this.data.teams.map((team,i)=>({...team,name:i===index?String(event.detail.value).slice(0,8):team.name}));this.setData({teams});},
 start(){if(!this._active||this.data.phase!=='setup'||this.data.adPending)return;this._newMatch();this.prepare();},
 _newMatch(){
  this._deck=rules.deck(this.data.category,this._seen,Math.random,this.data.mode);this._cursor=0;this._turn=0;this._rounds=[];
  this._teams=this.data.teams.slice(0,this.data.mode==='charades'&&this.data.grouped?this.data.teamCount:1).map((team,index)=>({name:team.name.trim()||'队伍 '+(index+1),score:0}));
  this.setData({final:false,ranking:[],matchRounds:[]});
 },
 prepare(){
  if(!this._active||this.data.adPending)return;this._clearTimer();this._history=[];this._lastMark=0;
  const index=this._turn%this._teams.length;this.setData({phase:'prepare',countdown:3,correct:0,skipped:0,history:[],word:'',teamName:this.data.mode==='heads'?'猜词玩家':this.data.grouped?this._teams[index].name:'准备比划',turnLabel:this.data.grouped?'第 '+(Math.floor(this._turn/this._teams.length)+1)+' / '+this.data.rounds+' 轮':''});
  this._prepareUntil=Date.now()+3000;this._timer=setInterval(()=>{const left=Math.ceil((this._prepareUntil-Date.now())/1000);if(left<=0){this._clearTimer();this._beginPlay();}else this.setData({countdown:left});},100);
 },
 _beginPlay(){
  if(!this._active)return;this._remaining=this.data.duration*1000;this.setData({phase:'playing',seconds:this.data.duration});this._nextWord();if(this.data.phase==='playing')this._runClock();
 },
 _nextWord(){
  if(this._cursor>=this._deck.length){this.finishRound();return;}
  const item=this._deck[this._cursor++];this._current=item;
  this._seen=this._seen.filter(word=>word!==item.word).concat(item.word).slice(-300);try{storage.write(this._seenKey,this._seen);}catch(_){}
  this.setData({word:item.word,wordCategory:item.category});
 },
 _runClock(){this._clearTimer();this._deadline=Date.now()+this._remaining;this._timer=setInterval(()=>{const left=this._deadline-Date.now();if(left<=0)this.finishRound();else{const seconds=Math.ceil(left/1000);if(seconds!==this.data.seconds)this.setData({seconds});}},100);},
 correct(){this.mark('correct');},skip(){this.mark('skip');},
 mark(status){
  if(!this._active||this.data.phase!=='playing'||!this._current)return;
  if(Date.now()>=this._deadline){this.finishRound();return;}
  if(Date.now()-(this._lastMark||0)<350)return;this._lastMark=Date.now();
  this._history.push({...this._current,status});this._syncHistory();storage.feedback(status==='correct'?'medium':'light');this._audio.play(status==='correct'?'safe':'card');this._nextWord();
 },
 _syncHistory(){this.setData({history:this._history.map(item=>({...item,label:item.status==='correct'?'答对':'跳过'})),correct:this._history.filter(item=>item.status==='correct').length,skipped:this._history.filter(item=>item.status==='skip').length});},
 pause(){
  if(this.data.phase==='playing'){
   this._remaining=Math.max(0,this._deadline-Date.now());if(!this._remaining){this.finishRound();return;}
   this._clearTimer();this.setData({phase:'paused',word:''});
  }else if(this.data.phase==='prepare'){this._clearTimer();this.setData({phase:'waiting'});}
 },
 resume(){
  if(!this._active||this.data.adPending)return;
  if(this.data.phase==='waiting'){this.prepare();return;}
  if(this.data.phase!=='paused')return;
  this._resumeClock();
 },
 _resumeClock(){this.setData({phase:'playing',word:this._current.word,wordCategory:this._current.category});this._runClock();},
 finishRound(){
  if(!['playing','paused'].includes(this.data.phase))return;
  this._clearTimer();this._syncHistory();
  const team=this._turn%this._teams.length,score=this.data.correct;this._teams[team].score+=score;
  this._rounds.push({key:this._turn,label:this.data.grouped?'第 '+(Math.floor(this._turn/this._teams.length)+1)+' 轮 · '+this._teams[team].name:'本轮成绩',score});
  const final=!(this.data.mode==='charades'&&this.data.grouped)||this._turn+1>=this._teams.length*this.data.rounds;
  this.setData({phase:'result',final,word:'',ranking:final&&this.data.grouped?rules.rankTeams(this._teams):[],matchRounds:this._rounds.slice()});
  this._detailPage=0;this.setData({detailTab:final&&this.data.grouped?'ranking':'words'});this._updateDetails();
  if(this._active){storage.feedback('medium');this._audio.play('finish');}
 },
 nextTeam(){if(!this._active||this.data.phase!=='result'||this.data.final)return;this._turn++;this.setData({phase:'waiting',teamName:this._teams[this._turn%this._teams.length].name,turnLabel:'第 '+(Math.floor(this._turn/this._teams.length)+1)+' / '+this.data.rounds+' 轮'});},
 again(){
  if(!this._active||this.data.phase!=='result'||!this.data.final||this.data.adPending)return;
  const action=()=>{this.setData({adPending:false});if(this._active&&!this._gone){this._newMatch();this.prepare();}};
  const placement=this.data.mode==='heads'?'headsReplay':'charadesReplay';
  if(!ads.shouldOffer(placement)){action();return;}this.setData({adPending:true});if(this._ads.play(action,{placement})===false)this.setData({adPending:false});
 },
 settings(){if(this.data.adPending)return;this._clearTimer();this.setData({phase:'setup'});},
 detailTab(event){const tab=event.currentTarget.dataset.tab;if(!['words','ranking','rounds'].includes(tab)||this.data.phase!=='result')return;this._detailPage=0;this.setData({detailTab:tab});this._updateDetails();},
 detailPage(event){this._detailPage=(this._detailPage||0)+Number(event.currentTarget.dataset.delta);this._updateDetails();},
 _updateDetails(){
  const rows=this.data.detailTab==='ranking'?this.data.ranking.map(item=>({key:item.index,title:item.rank+' · '+item.name,value:item.score+' 分'})):this.data.detailTab==='rounds'?this.data.matchRounds.map(item=>({key:item.key,title:item.label,value:item.score+' 分'})):this.data.history.map((item,index)=>({key:index,title:item.word,value:item.label,skipped:item.status==='skip'}));
  const pages=Math.max(1,Math.ceil(rows.length/4));this._detailPage=Math.max(0,Math.min(pages-1,this._detailPage||0));this.setData({detailPage:this._detailPage,detailPages:pages,detailRows:rows.slice(this._detailPage*4,this._detailPage*4+4)});
 },
 _clearTimer(){if(this._timer){clearInterval(this._timer);this._timer=null;}},
 goBack(){if(this.data.adPending)return;if(['playing','paused','prepare','waiting'].includes(this.data.phase)){this.pause();wx.showModal({title:'退出本场游戏？',content:'本场未完成的成绩不会保留。',success:res=>{if(res.confirm)wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/party/index'})});}});}else wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/party/index'})});},
 showHelp(){this.pause();wx.showModal({title:this.data.title,content:this.data.mode==='heads'?'横屏举到额头，屏幕朝向朋友。朋友提示，你来猜；由朋友点击底部“答对了”或“跳过”。暂停会遮住词语并冻结倒计时。':'表演者看词，用动作让队友猜，不能说出题目里的字。答对加1分，跳过不扣分；分组赛各队依次进行，所有轮次结束后按总分排名，同分并列。',showCancel:false});}
});

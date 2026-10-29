// 布局与轨迹对应 Flutter GameHubPage / PartyBilliardsBanner / PartyEntranceOverlay。
const entries = require('../../data/party-entries');
const storage = require('../../utils/storage');
const layout = require('../../utils/layout');
const ads = require('../../utils/ads');
const routes = { tossCoin:'/pages/coin/index', fingerSelection:'/pages/touch/index', sharkTeeth:'/pages/game/index?type=sharkTeeth', numberBomb:'/pages/game/index?type=numberBomb', truthDare:'/pages/game/index?type=truthDare', passBalloon:'/pages/game/index?type=passBalloon', blackEight:'/billiards/pages/table/index?mode=eight', snooker:'/billiards/pages/table/index?mode=snooker' };
const INTRO = {
 tossCoin:['抛硬币','先约定正面和反面各代表什么。抛出硬币，看停下后的正反面。','coin'],
 fingerSelection:['手指选人','每人将一根手指放在屏幕上。等待选择结果，随机选中一人。','random_person'],
 sharkTeeth:['鲨鱼牙齿','支持 2–12 人，开始后不能更改人数。轮流按一颗牙，按完传给下一位。按到坏牙的人中招，本局结束。','shark'],
 numberBomb:['数字炸弹','先选人数、数字范围和输入方式。轮流选一个当前范围内的数字；没猜中则范围缩小，猜中秘密数字的玩家中招。','number_bomb'],
 truthDare:['真心话大冒险','选真心话或大冒险，拿着手机读出来。点“换一个”或上滑卡片，就能换题。','truth_dare'],
 passBalloon:['传气球','点开始，3 秒倒数后轮流传手机。不用点屏幕，气球爆开时持机者中招。','balloon']
};
const SPRITES=['party_eight_ball.png','party_eight_ball_045.png','party_eight_ball_090.png','party_eight_ball_180.png','party_eight_ball_270.png','party_eight_ball_315.png','party_eight_ball.png'];
Page({
 data:{bannerUnit:'',bannerFailed:false,games:entries.filter(item=>!['snooker','blackEight'].includes(item.key)),billiards:entries.filter(item=>['snooker','blackEight'].includes(item.key)),safeTop:0,settingsOpen:false,settings:{sound:true,vibration:true},billiardsOpen:false,introShow:false,introTitle:'',introDescription:'',introIcon:'',entrance:false,entranceSeen:false,ball:{},cue:{},sprite:'party_eight_ball.png',nextSprite:'party_eight_ball.png',blend:0},
 onLoad(){const metric=layout.metrics();this._scale=2/metric.scale;this._height=metric.windowHeight*this._scale;this.setData({safeTop:metric.safeTop+metric.navHeight,entranceSeen:storage.read('party:entrance-seen',false)===true});},
 onShow(){this._active=true;this._bannerMounted=false;if(this.getTabBar())this.getTabBar().setData({selected:1,hidden:false});this.setData({settings:storage.getSettings()});this._syncTabbar();if(!this.data.entranceSeen)this._schedule=setTimeout(()=>this.startEntrance(),120);},
 onHide(){this._active=false;this._bannerMounted=false;this.setData({bannerUnit:''});clearTimeout(this._schedule);if(this.data.entrance)this.skipEntrance();clearTimeout(this._frameTimer);this.setData({settingsOpen:false,billiardsOpen:false,introShow:false});},
 onUnload(){this.onHide();},
 startEntrance(){if(!this._active||this.data.entranceSeen||this.data.entrance)return;wx.createSelectorQuery().in(this).select('.billiards-banner').boundingClientRect(rect=>{if(!rect||!this._active)return;this._target={x:(rect.left+rect.width*.736)*this._scale,y:(rect.top+rect.height*.545)*this._scale,size:rect.width*.36*this._scale};this._startTime=Date.now();this.setData({entrance:true});this._syncTabbar();this._entranceTick();}).exec();},
 _entranceTick(){if(!this._active||!this.data.entrance)return;const t=Math.min(1,(Date.now()-this._startTime)/3600),w=750,h=this._height,target=this._target;const frames=[[0,w*.54,h+w*.30,w*.47,-.08],[.16,w*.54,h*.67,w*.47,0],[.43,w*.54,h*.67,w*.47,0],[.57,w*.22,h*.59,w*.38,-.10],[.68,w*.81,h*.49,w*.34,.08],[.79,w*.18,h*.38,w*.32,-.07],[.94,target.x+w*.012,target.y+h*.006,target.size*1.025,.018],[1,target.x,target.y,target.size,0]];let frame=frames[7];for(let i=1;i<frames.length;i++){if(t>frames[i][0])continue;let f=(t-frames[i-1][0])/(frames[i][0]-frames[i-1][0]);if([1,6,7].includes(i))f=1-Math.pow(1-f,3);frame=frames[i].map((value,k)=>k?frames[i-1][k]+(value-frames[i-1][k])*f:t);break;}const roll=Math.max(0,Math.min(1,(t-.43)/.51)),angle=roll*360,angles=[0,45,90,180,270,315,360];let index=1;while(index<6&&angle>angles[index])index++;const blend=(angle-angles[index-1])/(angles[index]-angles[index-1]);const interval=(a,b)=>Math.max(0,Math.min(1,(t-a)/(b-a)));let gap=t<.18?.24:t<.28?.24-.18*interval(.18,.28):t<.36?.06+.08*interval(.28,.36):t<.43?.14*(1-interval(.36,.43)):t<.52?.16*interval(.43,.52):.16;this.setData({ball:{left:frame[1]-frame[3]/2,top:frame[2]-frame[3]/2,size:frame[3],angle:frame[4]*180/Math.PI},sprite:SPRITES[index-1],nextSprite:SPRITES[index],blend,cue:{left:w*.54+w*.47*.456+w*gap,top:h*.67+w*.47*.205+w*gap*.45-18,opacity:interval(.17,.23)*(1-interval(.48,.55))}});if(t>=1)this.skipEntrance();else this._frameTimer=setTimeout(()=>this._entranceTick(),30);},
 skipEntrance(){clearTimeout(this._frameTimer);this.setData({entrance:false,entranceSeen:true});this._syncTabbar();try{storage.write('party:entrance-seen',true);}catch(_){}},
 chooseBilliards(){if(this.data.entrance)return;this.setData({billiardsOpen:true});this._syncTabbar();},
 closeBilliards(){this.setData({billiardsOpen:false});this._syncTabbar();},
 play(event){const key=event.currentTarget.dataset.key;if(!routes[key])return;this.setData({billiardsOpen:false});this._syncTabbar();if(INTRO[key]&&!storage.read('party:intro:'+key,false)){const intro=INTRO[key];this._pendingKey=key;this.setData({introShow:true,introTitle:intro[0],introDescription:intro[1],introIcon:'/assets/original/party/party_intro_'+intro[2]+'.png'});this._syncTabbar();return;}wx.navigateTo({url:routes[key]});},
 confirmIntro(){const key=this._pendingKey;this.setData({introShow:false});this._syncTabbar();if(!key||!this._active)return;try{storage.write('party:intro:'+key,true);}catch(_){}this._pendingKey=null;wx.navigateTo({url:routes[key]});},
 closeIntro(){this._pendingKey=null;this.setData({introShow:false});this._syncTabbar();},
 showSettings(){this.setData({settingsOpen:true,settings:storage.getSettings()});this._syncTabbar();},closeSettings(){this.setData({settingsOpen:false});this._syncTabbar();},keepOpen(){},
 _syncTabbar(){const blocked=this.data.settingsOpen||this.data.billiardsOpen||this.data.introShow||this.data.entrance;const bar=this.getTabBar&&this.getTabBar();if(bar)bar.setData({hidden:blocked});if(blocked)this._bannerMounted=false;else if(this._active&&!this._bannerMounted){this._bannerMounted=true;this.setData({bannerUnit:ads.choose('banner'),bannerFailed:false});}},
  onMembershipChange(){this._bannerMounted=false;this.setData({bannerUnit:''});if(this._active)this._syncTabbar();},
 adLoad(event){if(event.currentTarget.dataset.unit!==this.data.bannerUnit)return;ads.bannerEvent('load',this.data.bannerUnit);},
 adError(event){if(event.currentTarget.dataset.unit!==this.data.bannerUnit)return;ads.bannerEvent('error',this.data.bannerUnit,event.detail);this.setData({bannerFailed:true});},
 adClose(event){if(event.currentTarget.dataset.unit!==this.data.bannerUnit)return;ads.bannerEvent('close',this.data.bannerUnit);this.setData({bannerFailed:true});},
 toggleSetting(event){const key=event.currentTarget.dataset.key;if(!['sound','vibration'].includes(key))return;try{this.setData({settings:storage.saveSettings({[key]:!this.data.settings[key]})});}catch(_){wx.showToast({title:'设置保存失败',icon:'none'});}}
});

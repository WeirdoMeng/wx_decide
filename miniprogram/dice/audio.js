// 原包collDiceBox / collDice / collTable完整音效，页面独立持有实例。
const storage=require('../utils/storage');
class DiceAudio{
 constructor(api){this.api=api;this.voices={};this.disposed=false;}
 play(type){if(this.disposed||!storage.getSettings().sound||!this.api.createInnerAudioContext||!['cup','dice','table'].includes(type))return;
  let entry=this.voices[type];
  if(!entry){
   const voice=this.api.createInnerAudioContext();entry={voice,state:'idle'};this.voices[type]=entry;
   voice.obeyMuteSwitch=false;
   voice.onPlay(()=>{entry.state='playing';entry.played=true;});
   voice.onEnded(()=>{entry.state='idle';});
   voice.onStop(()=>{entry.state='idle';});
   voice.onError(()=>{entry.state='idle';});
   voice.src='/dice/assets/'+type+'.wav';
  }
  if(entry.state==='pending')return;
  entry.voice.volume=type==='cup'?.85:.65;
  // 重播时回到开头，避免对尚未播放/已经结束的声道调用stop。
  if(entry.state==='playing'){entry.voice.seek(0);return;}
  entry.state='pending';if(entry.played)entry.voice.seek(0);entry.voice.play();
 }
 stop(){
  for(const [type,entry] of Object.entries(this.voices)){
   if(entry.state==='pending'){
    // 尚未收到onPlay时直接释放，防止离开页面后才开始响。
    entry.voice.destroy();delete this.voices[type];
   }else if(entry.state==='playing'){
    entry.state='idle';entry.voice.stop();
   }
  }
 }
 dispose(){if(this.disposed)return;this.disposed=true;Object.values(this.voices).forEach(entry=>entry.voice.destroy());this.voices={};}
}
module.exports={DiceAudio};

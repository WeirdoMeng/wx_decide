// Page-owned local short effects. No browser AudioContext or native bridge.
const storage=require('../utils/storage');
class BilliardsAudio {
  constructor() { this.enabled=true;this.paused=false;this.disposed=false;this.last=0;this.voices=[];this.index=0; }
  play(type,strength) {
    if(this.disposed||this.paused||!this.enabled||!storage.getSettings().sound||strength<.04)return;
    const now=Date.now();if(now-this.last<28&&type!=='pocket')return;this.last=now;
    if(this.voices.length<4){const voice=wx.createInnerAudioContext();voice.obeyMuteSwitch=true;voice.onError(()=>{});this.voices.push(voice);}
    const voice=this.voices[this.index++%this.voices.length];voice.stop();voice.volume=Math.min(.8,.18+strength*.55);voice.src='/billiards/assets/'+(['cue','impact','cushion','pocket'].includes(type)?type:'impact')+'.wav';voice.play();
  }
  setEnabled(value){this.enabled=value;if(!value)this.stop();}
  stop(){this.voices.forEach(v=>v.stop());}
  setPaused(value){this.paused=value;if(value)this.stop();}
  dispose(){if(this.disposed)return;this.disposed=true;this.voices.forEach(v=>{v.stop();v.destroy();});this.voices=[];}
}
module.exports={BilliardsAudio};

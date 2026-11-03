// 短音效只在用户操作/轮次结束时播放；直接销毁避免停止空闲声道。
const storage=require('../utils/storage');
function createAudio(){let voice=null;return{play(name){this.stop();if(!storage.getSettings().sound||!wx.createInnerAudioContext)return;voice=wx.createInnerAudioContext();voice.onError(()=>{});voice.src='/images/party-game/party_sound_'+name+'.wav';voice.play();},stop(){if(voice){voice.destroy();voice=null;}}};}
module.exports={createAudio};

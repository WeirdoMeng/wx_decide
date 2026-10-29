const storage = require('./storage');
// 每个页面持有独立音频实例，离开页面立即释放，遵循本地声音偏好。
function createPlayer() {
  let audio = null;
  return {
    play(name = 'finish') {
      if (!storage.getSettings().sound || !wx.createInnerAudioContext) return;
      if (!audio) {
        audio = wx.createInnerAudioContext();
        audio.obeyMuteSwitch = true;
        audio.onError(() => {});
      }
      audio.stop();
      audio.src = '/images/party-game/party_sound_' + name + '.wav';
      audio.play();
    },
    destroy() { if (audio) { audio.stop(); audio.destroy(); audio = null; } }
  };
}
module.exports = { createPlayer };

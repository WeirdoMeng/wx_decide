const rules = require('../../utils/party-rules');
const storage = require('../../utils/storage');
const questions = require('../../data/questions');
const layout = require('../../utils/layout');
const ads = require('../../utils/ads');
const effects = require('./effects');
const ART = '/assets/original/party/';
const AUDIO = '/images/party-game/';
const TITLES = { sharkTeeth: '鲨鱼牙齿', numberBomb: '数字炸弹', truthDare: '真心话大冒险', passBalloon: '传气球' };
Page({
  data: {
    type: 'sharkTeeth', title: '鲨鱼牙齿', phase: 'setup', art: ART,
    players: 2, minPlayers: 2, maxPlayers: 12, toothCount: 12, teethRows: [], remaining: 12,
    currentPlayer: 1, loser: 0, locked: false, maxNumber: 100, rangeOptions: [50, 100, 200], proxyMode: false,
    availableMin: 1, availableMax: 100, rangeLeft: 0, rangeWidth: 100,
    input: '', canSubmit: false, error: '', attempts: 0, secret: '', lastHint: '', lastGuess: '',
    keypad: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'delete'],
    truth: true, question: '', questionScale:1, outgoingScale:1, questionCount: 0, questionRead: 0, flipping: false, origin: '',
    pace: 1, paceOptions: ['快速', '正常', '慢速'], countdown: 3, balloonScale: 1, holding: false,
    saveWarning: '', topShift:0, canvasHeight:1624, settingsOpen:false, settings:{sound:true,vibration:true}, exitOpen:false, introShow:false, introDescription:'', introIcon:'', dragY:0, returning:false, outgoingQuestion:'', flightDuration:380
  },
  onLoad(options) {
    this._active = true;
    this._leaving = false;
    this._timers = new Set();
    this._round = null;
    this._adController = ads.controller(() => this._active && !this._leaving);
    const type = Object.prototype.hasOwnProperty.call(TITLES, options.type) ? options.type : 'sharkTeeth';
    this.setData({ type, title: TITLES[type], origin: options.origin || '' });
    this.updateLayout();
    wx.setNavigationBarTitle({ title: TITLES[type] });
    if (type === 'sharkTeeth') {
      const players = rules.clamp(storage.read('party:shark-players', 2), 2, 12);
      this.setData({ players, toothCount: rules.sharkToothCount(players) });
    } else if (type === 'numberBomb') {
      const savedMax = Number(storage.read('party:number-range', 100));
      const maxNumber = [50, 100, 200].includes(savedMax) ? savedMax : 100;
      this.setData({ players: 4, maxPlayers: 8, maxNumber, availableMax: maxNumber, proxyMode: storage.read('party:number-proxy', false) === true });
    } else if (type === 'truthDare') {
      this._questionCache = {};
      this._decks = {
        truths: new rules.QuestionDeck(questions.truths, storage.read('party:questions-truths', {})),
        dares: new rules.QuestionDeck(questions.dares, storage.read('party:questions-dares', {}))
      };
      this._drawQuestion(false);
      this._sound('start');
    } else {
      this.setData({ phase: 'ready', pace: rules.clamp(storage.read('party:balloon-pace', 1), 0, 2) });
    }
    this._syncNativeBackGuard();
  },
  updateLayout() {
    const metrics=layout.metrics();this._pixelScale=metrics.scale;
    const topShift=(metrics.safeTop+metrics.navHeight+(metrics.helpHeight||44))/metrics.scale*2-192;
    this.setData({contentTop:metrics.safeTop+metrics.navHeight+(metrics.helpHeight||44),topShift,canvasHeight:Math.max(1624+topShift+(metrics.safeBottom||0)/metrics.scale*2+32,metrics.windowHeight/metrics.scale*2)});
  },
  onResize() { this.updateLayout(); },
  onShow() {
    this.updateLayout();
    this._active = true;
    this._leaving = false;
    this.setData({settings:storage.getSettings()});
    if (this._restartAfterPunishment) {
      this._restartAfterPunishment = false;
      this.start();
    }
    this._syncNativeBackGuard();
  },
  onHide() { if(this._adController)this._adController.cancel();this._adGate=false;this._deactivate(); },
  onUnload() {
    if(this._adController)this._adController.dispose();
    this._deactivate();
    if (this._audio) { this._audio.destroy(); this._audio = null; }
  },
  _deactivate(skipNativeDisable = false) {
    this._active = false;
    if (!skipNativeDisable) this._disableNativeBackGuard();
    this._dragging=false;
    this._stopEffects();
    this._clearTimers();
    if (this._audio) this._audio.stop();
    if (this.data.type === 'passBalloon' && ['countdown', 'playing', 'exploding'].includes(this.data.phase)) {
      this.setData({ phase: 'ready', countdown: 3, balloonScale: 1, holding: false });
    } else if (this.data.type === 'sharkTeeth') {
      if (this.data.phase === 'biting') this.setData({ phase: 'result', locked: false });
      else this.setData({ locked: false });
    } else if (this.data.type === 'numberBomb' && this.data.phase === 'exploding') {
      this.setData({ phase: 'result' });
    }
    this.setData({ flipping: false, holding: false, dragY:0, returning:false, outgoingQuestion:'', settingsOpen:false, exitOpen:false, introShow:false });
  },
  _roundActive(){return this.data.type==='truthDare'||['playing','biting','input','handoff','lastReveal','countdown','exploding'].includes(this.data.phase);},
  // Official WeChat API (base library >=2.12.0): native/Android Back confirmation.
  // https://developers.weixin.qq.com/miniprogram/dev/api/ui/interaction/wx.enableAlertBeforeUnload.html
  // The official contract explicitly excludes swipe-back gestures and exiting the mini program.
  _syncNativeBackGuard(){
    if(this.data.phase==='result'&&this._adRoundOpen){this._adRoundOpen=false;ads.recordRound();}
    const enabled=!!(this._active&&!this._leaving&&this._roundActive());
    if(enabled===this._nativeGuardEnabled)return;
    if(!enabled){this._disableNativeBackGuard();return;}
    if(typeof wx.enableAlertBeforeUnload!=='function')return;
    const revision=(this._nativeGuardRevision||0)+1;this._nativeGuardRevision=revision;this._nativeGuardEnabled=true;
    try{wx.enableAlertBeforeUnload({message:this.data.origin?'本局取消，返回上一游戏。':'本局取消，返回聚会。',fail:()=>{if(this._nativeGuardRevision===revision)this._nativeGuardEnabled=false;}});}catch(_){this._nativeGuardEnabled=false;}
  },
  _disableNativeBackGuard(done){
    this._nativeGuardRevision=(this._nativeGuardRevision||0)+1;this._nativeGuardEnabled=false;
    if(typeof wx.disableAlertBeforeUnload!=='function'){if(done)done();return;}
    let finished=false;const complete=()=>{if(finished)return;finished=true;if(done)done();};
    try{wx.disableAlertBeforeUnload({complete});}catch(_){complete();}
  },
  _leavePage(action){
    if(this._leaving)return;
    this._leaving=true;this._active=false;
    // Wait for disable to complete before programmatic navigation to avoid a second native dialog.
    this._disableNativeBackGuard(()=>{this._deactivate(true);action();});
  },
  _later(callback, ms) {
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      if (this._active) callback();
    }, ms);
    this._timers.add(timer);
    return timer;
  },
  _clearTimers() {
    if (this._timers) this._timers.forEach(clearTimeout);
    this._timers = new Set();
    this._holdTimer = null;
  },
  _save(key, value) {
    try { storage.write(key, value); this.setData({ saveWarning: '' }); }
    catch (_) { this.setData({ saveWarning: '本机存储写入失败，下次打开可能无法恢复设置或抽题进度。' }); }
  },
  _sound(name) {
    if (!this._active || !storage.getSettings().sound || !wx.createInnerAudioContext) return;
    if (!this._audio) {
      this._audio = wx.createInnerAudioContext();
      this._audio.obeyMuteSwitch = true;
      this._audio.onError(() => {});
    }
    this._audio.stop();
    this._audio.src = AUDIO + 'party_sound_' + name + '.wav';
    this._audio.play();
  },
  _feedback(type = 'light') { if (this._active) storage.feedback(type); },
  help() {
    this.cancelHold();
    this._stopEffects();
    const text={sharkTeeth:'支持 2–12 人，开始后不能更改人数。轮流按一颗牙，按完传给下一位。按到坏牙的人中招，本局结束。',numberBomb:'先选人数、数字范围和输入方式。轮流选一个当前范围内的数字；没猜中则范围缩小，猜中秘密数字的玩家中招。',truthDare:'选真心话或大冒险，拿着手机读出来。点“换一个”或上滑卡片，就能换题。',passBalloon:'点开始，3 秒倒数后轮流传手机。不用点屏幕，气球爆开时持机者中招。'};
    const icon={sharkTeeth:'shark',numberBomb:'number_bomb',truthDare:'truth_dare',passBalloon:'balloon'};
    this.setData({introShow:true,introDescription:text[this.data.type],introIcon:ART+'party_intro_'+icon[this.data.type]+'.png'});
  },
  closeIntro(){this.setData({introShow:false});},
  showSettings(){this.cancelHold();this._stopEffects();this.setData({settingsOpen:true,settings:storage.getSettings()});},
  closeSettings(){this.setData({settingsOpen:false});},
  keepOpen(){},
  toggleSetting(event){const key=event.currentTarget.dataset.key;if(!['sound','vibration'].includes(key))return;try{this.setData({settings:storage.saveSettings({[key]:!this.data.settings[key]})});}catch(_){this.setData({saveWarning:'设置保存失败，请重试。'});}},
  requestBack(){const active=this._roundActive();if(active){this.cancelHold();this._stopEffects();this.setData({exitOpen:true});}else this.confirmExit();},
  continueGame(){this.setData({exitOpen:false});},
  confirmExit(){this._leavePage(()=>wx.navigateBack({fail(){wx.switchTab({url:'/pages/party/index'});}}));},
  changePlayers(event) {
    if (this.data.phase !== 'setup') return;
    const players = rules.clamp(this.data.players + Number(event.currentTarget.dataset.delta), 2, this.data.maxPlayers);
    this.setData({ players, toothCount: rules.sharkToothCount(players) });
    this._feedback();
    if (this.data.type === 'sharkTeeth') this._save('party:shark-players', players);
  },
  chooseRange(event) {
    if (this.data.phase !== 'setup') return;
    const maxNumber = Number(event.currentTarget.dataset.value);
    if (![50, 100, 200].includes(maxNumber)) return;
    this.setData({ maxNumber, availableMax: maxNumber });
    this._save('party:number-range', maxNumber);
  },
  chooseMode(event) {
    if (this.data.phase !== 'setup') return;
    const proxyMode = event.currentTarget.dataset.value === 'proxy';
    this.setData({ proxyMode });
    this._save('party:number-proxy', proxyMode);
  },
  choosePace(event) {
    if (this.data.phase !== 'ready') return;
    const pace = rules.clamp(event.currentTarget.dataset.value, 0, 2);
    this.setData({ pace });
    this._save('party:balloon-pace', pace);
  },
  start() {
    if (!this._active || this._adGate || !['setup', 'result', 'ready'].includes(this.data.phase)) return;
    if(ads.shouldOffer(this.data.type)&&this._adController){this._adGate=true;const accepted=this._adController.play(()=>{this._adGate=false;if(this._active&&!this._leaving)this._startRound();},{placement:this.data.type});if(accepted===false)this._adGate=false;return;}
    this._startRound();
  },
  _startRound() {
    this._adRoundOpen=true;
    this._clearTimers();
    if (this.data.type === 'sharkTeeth') {
      this._round = rules.createSharkRound(this.data.players);
      this._syncShark();
      this._sound('start');
    } else if (this.data.type === 'numberBomb') {
      this._round = rules.createBombRound(this.data.players, this.data.maxNumber);
      this._syncBomb({ input: '', lastHint: '', lastGuess: '', secret: '' });
      this._sound('start');
    } else if (this.data.type === 'passBalloon') {
      this.setData({ phase: 'countdown', countdown: 3, balloonScale: 1, holding: false });
      this._sound('tick');
      this._countDownTick();
    }
    this._syncNativeBackGuard();
  },
  _syncShark(extra = {}) {
    const round = this._round;
    const teeth = round.pressed.map((pressed, index) => ({ index, pressed }));
    const split = Math.ceil(teeth.length / 2);
    this.setData(Object.assign({ phase: round.phase, currentPlayer: round.currentPlayer + 1, loser: round.loser === null ? 0 : round.loser + 1, remaining: round.pressed.filter(value => !value).length, teethRows: [{ id: 'top', teeth: teeth.slice(0, split) }, { id: 'bottom', teeth: teeth.slice(split) }], locked: false }, extra));
    this._syncNativeBackGuard();
  },
  pressTooth(event) {
    if (!this._active || this.data.locked || this.data.phase !== 'playing') return;
    const next = rules.pressSharkTooth(this._round, Number(event.currentTarget.dataset.index));
    if (next === this._round) return;
    this._round = next;
    const biting = next.phase === 'biting';
    this._syncShark({ locked: true });
    this._sound(biting ? 'bite' : 'safe');
    this._feedback(biting ? 'heavy' : 'light');
    this._later(() => {
      if (biting) {
        this._round.phase = 'result';
        this._syncShark();
        this._sound('finish');
      } else this.setData({ locked: false });
    }, biting ? 750 : 900);
  },
  _syncBomb(extra = {}) {
    const round = this._round;
    this.setData(Object.assign({ phase: round.phase, currentPlayer: round.currentPlayer + 1, loser: round.loser === null ? 0 : round.loser + 1, availableMin: round.lower + 1, availableMax: round.upper - 1, attempts: round.attempts, error: round.error, rangeLeft: round.lower / round.maxNumber * 100, rangeWidth: (round.upper - round.lower - 1) / round.maxNumber * 100, canSubmit: false }, extra));
    this._syncNativeBackGuard();
  },
  keyPress(event) {
    if (this.data.phase !== 'input') return;
    const key = event.currentTarget.dataset.key;
    let input = this.data.input;
    if (key === 'delete') input = input.slice(0, -1);
    else if (key === 'clear') input = '';
    else if (input.length < String(this.data.maxNumber).length && (input || key !== '0')) input += key;
    const guess = Number(input);
    this.setData({ input, error: '', canSubmit: !!input && guess >= this.data.availableMin && guess <= this.data.availableMax });
    this._sound('tick');
  },
  submitGuess() {
    if (!this._active || !this.data.canSubmit || this.data.phase !== 'input') return;
    const raw = this.data.input;
    this._round = rules.submitNumberGuess(this._round, raw);
    if (this._round.error) { this._syncBomb({ input: raw }); return; }
    const guess = Number(raw);
    this._syncBomb({ input: '', phase:this._round.phase==='result'?'exploding':this._round.phase, lastGuess: guess, lastHint: guess < this._round.secret ? '猜得偏小，范围向右收缩' : '猜得偏大，范围向左收缩' });
    if (this._round.phase === 'result') this._explodeBomb();
    else { this._sound('safe'); this._feedback('medium'); }
  },
  continueTurn() {
    if (this.data.phase !== 'handoff') return;
    this._round.phase = 'input';
    this._syncBomb({ input: '' });
    this._sound('tick');
  },
  revealLast() {
    if (this.data.phase !== 'lastReveal') return;
    this._round.loser = this._round.currentPlayer;
    this._round.phase = 'result';
    this._syncBomb({phase:'exploding'});
    this._explodeBomb();
  },
  _explodeBomb() {
    this.setData({ phase: 'exploding', secret: this._round.secret },()=>this._startEffects('bomb'));
    this._syncNativeBackGuard();
    this._later(()=>{this._sound('burst');this._feedback('heavy');},342);
    this._later(() => { this.setData({ phase: 'result' }); this._syncNativeBackGuard(); this._sound('finish'); }, 900);
  },
  switchTruth(event) {
    const truth = event.currentTarget.dataset.mode === 'truths';
    if (truth === this.data.truth || this._adGate || this.data.flipping || this._dragging || this.data.returning) return;
    this.setData({ truth });
    const mode = truth ? 'truths' : 'dares';
    if (!this._questionCache[mode]) this._drawQuestion(false);
    else this._renderQuestion(mode, false);
    this._sound('safe');
  },
  nextQuestion() { this._flingQuestion(0); },
  cardTouchStart(event){if(this._adGate||this.data.flipping||this.data.returning)return;const touch=event.touches[0];if(!touch)return;this._dragging=true;this._dragStart=touch.clientY;this._dragStartTime=Date.now();this._lastDragY=touch.clientY;this._lastDragTime=Date.now();this._dragVelocity=0;},
  cardTouchMove(event){if(!this._dragging||this.data.flipping)return;const touch=event.touches[0];if(!touch)return;const now=Date.now();if(now>this._lastDragTime)this._dragVelocity=(touch.clientY-this._lastDragY)/this._pixelScale/(now-this._lastDragTime)*1000;this._lastDragY=touch.clientY;this._lastDragTime=now;const y=Math.max(-600,Math.min(0,(touch.clientY-this._dragStart)/this._pixelScale));this.setData({dragY:y*2});},
  cardTouchEnd(){if(!this._dragging)return;this._dragging=false;const velocity=Date.now()-this._lastDragTime<=100?(this._dragVelocity||0):0;if(this.data.dragY < -160 || velocity < -180)this._flingQuestion(velocity);else this._returnCard();},
  cardTouchCancel(){this._dragging=false;this._returnCard();},
  _returnCard(){if(!this.data.dragY)return;this.setData({returning:true,dragY:0});this._later(()=>this.setData({returning:false}),340);},
  _flingQuestion(velocity){
    if(this._adGate||this.data.flipping||this.data.returning||this._dragging)return;
    if(ads.shouldOffer('truth')){
      this._adGate=true;this.setData({dragY:0});
      const accepted=this._adController.play(()=>{this._adGate=false;if(this._active&&!this._leaving)this._showNextQuestion(velocity);},{placement:'truth'});
      if(accepted===false)this._adGate=false;
      return;
    }
    this._showNextQuestion(velocity);
  },
  _showNextQuestion(velocity){
    const outgoingQuestion=this.data.question,outgoingScale=this.data.questionScale;
    const duration=Math.round(Math.max(200,Math.min(290,290-Math.max(-velocity,0)/35)))+90;
    this._drawQuestion(false);
    this.setData({outgoingQuestion,outgoingScale,flipping:true,flightDuration:duration});
    this._sound('card');
    this._later(()=>this.setData({flipping:false,outgoingQuestion:'',dragY:0}),duration);
  },
  _drawQuestion(animate) {
    const mode = this.data.truth ? 'truths' : 'dares';
    const deck = this._decks[mode];
    this._questionCache[mode] = deck.draw() || '暂无题目';
    this._save('party:questions-' + mode, deck.progress());
    this._renderQuestion(mode, animate);
  },
  _renderQuestion(mode, animate) {
    this.setData({ question: this._questionCache[mode], questionScale:1, questionCount: this._decks[mode].source.length, questionRead: this._decks[mode].seen.size, flipping: !!animate },()=>this._fitQuestion());
    if (animate) {
      this._sound('card');
      this._feedback();
      this._later(() => this.setData({ flipping: false }), 360);
    }
  },
  _fitQuestion(){if(!wx.createSelectorQuery)return;const question=this.data.question;wx.createSelectorQuery().in(this).select('.question-measure').boundingClientRect(rect=>{if(!this._active||this.data.question!==question||!rect||!rect.height)return;this.setData({questionScale:Math.min(1,132/(rect.height/this._pixelScale))});}).exec();},
  _countDownTick() {
    this._later(() => {
      if (this.data.phase !== 'countdown') return;
      const countdown = this.data.countdown - 1;
      if (countdown > 0) {
        this.setData({ countdown }); this._sound('tick'); this._countDownTick();
      } else {
        this._balloonTime = rules.balloonDuration(this.data.pace);
        this._balloonElapsed = 0;
        this.setData({ phase: 'playing', balloonScale: 0.76 });
        this._sound('start');
        this._balloonTick();
      }
    }, 1000);
  },
  _balloonTick() {
    this._later(() => {
      if (this.data.phase !== 'playing') return;
      this._balloonElapsed += 1;
      if (this._balloonElapsed >= this._balloonTime) {
        this.cancelHold();
        this.setData({ phase: 'exploding' },()=>this._startEffects('burst'));
        this._sound('burst'); this._feedback('heavy');
        this._later(() => { this.setData({ phase: 'result', balloonScale: 1 }); this._syncNativeBackGuard(); this._sound('finish'); }, 620);
      } else {
        this.setData({ balloonScale: 0.76 + 0.70 * this._balloonElapsed / this._balloonTime });
        this._sound('inflate');
        this._balloonTick();
      }
    }, 1000);
  },
  beginHold() {
    if (this.data.phase !== 'playing' || this._holdTimer) return;
    this.setData({ holding: true },()=>this._startEffects('hold'));
    this._holdTimer = this._later(() => {
      this._holdTimer = null;
      if (this.data.phase === 'playing') { this.adjust(); this._feedback('medium'); }
    }, 800);
  },
  cancelHold() {
    this._stopEffects();
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._timers.delete(this._holdTimer); this._holdTimer = null; }
    this.setData({ holding: false });
  },
  adjust() {
    if(this._adController)this._adController.cancel();this._adGate=false;this._adRoundOpen=false;
    this._stopEffects();
    this._clearTimers();
    if (this._audio) this._audio.stop();
    this._round = null;
    this.setData({ phase: this.data.type === 'passBalloon' ? 'ready' : 'setup', input: '', error: '', locked: false, countdown: 3, balloonScale: 1, holding: false });
    this._syncNativeBackGuard();
  },
  punishment() {
    if(this._adGate)return;
    if (this.data.phase !== 'result') return;
    wx.navigateTo({ url: '/pages/game/index?type=truthDare&origin=' + this.data.type, events: { restart: () => { this._restartAfterPunishment = true; } } });
  },
  finishPunishment() {
    if (!this.data.origin) return;
    const channel = this.getOpenerEventChannel();
    this._leavePage(()=>{channel.emit('restart');wx.navigateBack();});
  },
  // Canvas initialization follows the existing wheel Canvas 2D path; painter math comes from Flutter source.
  _stopEffects(){if(this._effectCanvas&&this._effectFrame)this._effectCanvas.cancelAnimationFrame(this._effectFrame);this._effectCanvas=null;this._effectFrame=null;this._effectRevision=(this._effectRevision||0)+1;},
  _startEffects(mode){
    this._stopEffects();if(!this._active||!wx.createSelectorQuery)return;
    const revision=this._effectRevision;
    wx.createSelectorQuery().in(this).select(mode==='hold'?'#hold-effects':mode==='bomb'?'#bomb-effects':'#balloon-effects').fields({node:true,size:true}).exec(result=>{
      if(!this._active||revision!==this._effectRevision||!result[0]||!result[0].node)return;
      const canvas=result[0].node,info=wx.getWindowInfo?wx.getWindowInfo():{pixelRatio:2},ratio=info.pixelRatio||2,width=result[0].width,height=result[0].height;
      canvas.width=width*ratio;canvas.height=height*ratio;
      const ctx=canvas.getContext('2d'),started=Date.now(),duration=mode==='hold'?800:mode==='bomb'?900:620;
      this._effectCanvas=canvas;
      const frame=()=>{if(!this._active||revision!==this._effectRevision||mode==='hold'&&!this.data.holding||mode!=='hold'&&this.data.phase!=='exploding')return;const t=Math.min(1,(Date.now()-started)/duration);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);ctx.save();if(mode==='hold'){ctx.scale(width/122,width/122);effects.paintHold(ctx,t);}else if(mode==='bomb'){ctx.scale(width/344,width/344);effects.paintBombExplosion(ctx,t);}else{ctx.scale(width/375,width/375);ctx.translate(43,100);effects.paintBalloonBurst(ctx,t);}ctx.restore();if(t<1)this._effectFrame=canvas.requestAnimationFrame(frame);};
      this._effectFrame=canvas.requestAnimationFrame(frame);
    });
  },
  onShareAppMessage() { return { title: this.data.title + '，和朋友一起玩', path: '/pages/game/index?type=' + this.data.type }; }
});

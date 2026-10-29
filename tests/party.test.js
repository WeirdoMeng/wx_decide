const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../miniprogram/utils/party-rules');
const questions = require('../miniprogram/data/questions');

test('鲨鱼人数与牙数沿用原规则，包括 5、6、7 人边界', () => {
  assert.deepEqual(Array.from({ length: 11 }, (_, i) => rules.sharkToothCount(i + 2)), [12, 12, 12, 10, 12, 7, 8, 9, 10, 11, 12]);
  assert.equal(rules.createSharkRound(20).players, 12);
  assert.equal(rules.createSharkRound(1).players, 2);
});
test('鲨鱼一颗坏牙，安全轮换、已按牙齿和越界输入不能推进回合', () => {
  const original = rules.createSharkRound(3, () => 0);
  assert.equal(original.badTooth, 0);
  let round = rules.pressSharkTooth(original, 1);
  assert.equal(original.pressed[1], false);
  assert.equal(round.currentPlayer, 1);
  assert.equal(rules.pressSharkTooth(round, 1), round);
  assert.equal(rules.pressSharkTooth(round, -1), round);
  round = rules.pressSharkTooth(round, 2);
  round = rules.pressSharkTooth(round, 3);
  assert.equal(round.currentPlayer, 0);
  round = rules.pressSharkTooth(round, 0);
  assert.equal(round.phase, 'biting');
  assert.equal(round.loser, 0);
  assert.equal(rules.pressSharkTooth(round, 4), round);
});
test('数字炸弹范围包含两端，拒绝小数和当前范围外输入且不增加次数', () => {
  const round = rules.createBombRound(4, 100, () => 0);
  assert.equal(round.secret, 1);
  assert.equal(rules.createBombRound(4, 100, () => 0.999999).secret, 100);
  for (const input of ['', '0', '101', '3.5', '1e1', '-1', 'abc']) {
    const result = rules.submitNumberGuess(round, input);
    assert.ok(result.error);
    assert.equal(result.attempts, 0);
    assert.equal(result.currentPlayer, 0);
  }
});
test('数字炸弹安全报数缩小范围并轮换，猜中当前玩家中招', () => {
  let round = rules.createBombRound(2, 100, () => 0.49);
  assert.equal(round.secret, 50);
  round = rules.submitNumberGuess(round, '20');
  assert.equal(round.lower, 20);
  assert.equal(round.currentPlayer, 1);
  assert.equal(round.phase, 'handoff');
  assert.equal(rules.submitNumberGuess(round, '50'), round);
  round = Object.assign({}, round, { phase: 'input' });
  round = rules.submitNumberGuess(round, '70');
  assert.equal(round.upper, 70);
  assert.equal(round.currentPlayer, 0);
  round = Object.assign({}, round, { phase: 'input' });
  round = rules.submitNumberGuess(round, '50');
  assert.equal(round.phase, 'result');
  assert.equal(round.loser, 0);
  assert.equal(round.attempts, 3);
});
test('数字炸弹仅剩一个数字进入下一位揭晓状态', () => {
  let round = rules.createBombRound(4, 50, () => 0);
  round = rules.submitNumberGuess(round, '2');
  assert.equal(round.phase, 'lastReveal');
  assert.equal(round.lower + 1, 1);
  assert.equal(round.upper - 1, 1);
  assert.equal(round.currentPlayer, 1);
});
test('题库全部抽完前不重复、模式进度互不混用', () => {
  for (const source of [questions.truths, questions.dares]) {
    let deck = new rules.QuestionDeck(source);
    const drawn = [];
    for (let index = 0; index < source.length; index += 1) {
      if (index === 50) deck = new rules.QuestionDeck(source, JSON.parse(JSON.stringify(deck.progress())));
      drawn.push(deck.draw());
    }
    assert.equal(new Set(drawn).size, source.length);
    assert.deepEqual(new Set(drawn), new Set(source));
    assert.notEqual(deck.draw(), drawn[drawn.length - 1]);
    assert.equal(deck.progress().seen.length, 1);
  }
  const dares = new rules.QuestionDeck(questions.dares);
  assert.equal(dares.progress().seen.length, 0);
});
test('题库跨启动继续本轮，内容增删后保留已读且新题可抽', () => {
  const source = ['a', 'b', 'c'];
  let deck = new rules.QuestionDeck(source, {}, () => 0);
  const first = deck.draw();
  const progress = deck.progress();
  deck = new rules.QuestionDeck(source, JSON.parse(JSON.stringify(progress)), () => 0.5);
  assert.notEqual(deck.draw(), first);
  assert.notEqual(deck.draw(), first);
  assert.equal(deck.progress().seen.length, 3);
  const last = deck.progress().lastQuestion;
  deck = new rules.QuestionDeck(source, deck.progress(), () => 0);
  assert.notEqual(deck.draw(), last);
  const changed = new rules.QuestionDeck([first, 'new'], progress, () => 0);
  assert.equal(changed.draw(), 'new');
  assert.equal(new rules.QuestionDeck(source, null).source.length, 3);
});
test('气球三种速度随机时间包含原区间端点', () => {
  for (let pace = 0; pace < 3; pace += 1) {
    assert.equal(rules.balloonDuration(pace, () => 0), rules.BALLOON_RANGES[pace][0]);
    assert.equal(rules.balloonDuration(pace, () => 0.999999), rules.BALLOON_RANGES[pace][1]);
  }
});

// 运行真实 Page 定义的状态流，模拟小程序生命周期与计时器。
function game(type, initialStorage = {}, wxOverrides = {}, adOverrides = null) {
  let definition;
  let timerId = 0;
  let frameId = 0;
  let now = Date.now();
  const timers = new Map(), frames = new Map(), canvases = new Map(), queries = [];
  const saved = Object.assign({}, initialStorage);
  const audio = { plays: 0, stops: 0, play() { this.plays += 1; }, stop() { this.stops += 1; }, destroy() {}, onError() {} };
  const nativeEvents=[];
  const pageFile = path.join(__dirname, '../miniprogram/pages/game/index.js');
  const markup = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/game/index.wxml'), 'utf8');
  const realEffects = require('../miniprogram/pages/game/effects');
  function makeCanvas(selector, width, height) {
    const commands=[], contextTypes=[];
    const context = {};
    for (const method of ['setTransform','clearRect','save','restore','scale','translate','rotate','beginPath','arc','arcTo','lineTo','moveTo','closePath','quadraticCurveTo','fill','stroke']) {
      context[method] = (...args) => {
        args.filter(value => typeof value === 'number').forEach(value => assert.ok(Number.isFinite(value), method+' received a non-finite coordinate'));
        commands.push({ method, args });
      };
    }
    for (const method of ['createLinearGradient','createRadialGradient']) {
      context[method] = (...args) => {
        commands.push({method,args});
        return { addColorStop(offset,color) { assert.ok(offset>=0&&offset<=1); assert.equal(typeof color,'string'); } };
      };
    }
    const canvas = {
      width:0,height:0, commands, contextTypes,
      getContext(kind) { contextTypes.push(kind);assert.equal(kind,'2d');return context; },
      requestAnimationFrame(callback) { const id=++frameId;frames.set(id,{canvas,callback});return id; },
      cancelAnimationFrame(id) { frames.delete(id); }
    };
    canvases.set(selector, canvas);
    return {node:canvas,width,height};
  }
  const wx = Object.assign({
    setNavigationBarTitle() {}, createInnerAudioContext() { return audio; },
    getWindowInfo(){return {windowWidth:375,windowHeight:812,pixelRatio:2,statusBarHeight:24};},
    enableAlertBeforeUnload(options){nativeEvents.push({type:'enable',message:options.message});if(options.success)options.success();},
    disableAlertBeforeUnload(options){nativeEvents.push({type:'disable'});if(options.complete)options.complete();},
    navigateBack(){nativeEvents.push({type:'navigateBack'});},switchTab(){nativeEvents.push({type:'switchTab'});},
    createSelectorQuery() {
      let owner,selector,fields,bounds;
      return {
        in(page){owner=page;return this;},select(value){selector=value;return this;},
        fields(value){fields=value;return this;},boundingClientRect(callback){bounds=callback;return this;},
        exec(callback){
          if(bounds){bounds({width:265,height:108});return;}
          queries.push({selector,fields});
          assert.deepEqual(Object.keys(fields).sort(),['node','size']);
          assert.equal(fields.node,true);assert.equal(fields.size,true);
          const tag=markup.match(new RegExp('<canvas\\b(?=[^>]*\\bid="'+selector.slice(1)+'")[^>]*>'));
          assert.ok(tag,'Canvas node must exist in WXML: '+selector);assert.match(tag[0],/\btype="2d"/);
          const visible=!owner.data.introShow&&!owner.data.settingsOpen&&!owner.data.exitOpen;
          if(!visible||selector==='#hold-effects'&&!owner.data.holding||selector!=='#hold-effects'&&owner.data.phase!=='exploding'){callback([null]);return;}
          const size=selector==='#hold-effects'?[122,122]:selector==='#bomb-effects'?[344,344]:[375,488];
          callback([makeCanvas(selector,size[0],size[1])]);
        }
      };
    }
  }, wxOverrides);
  const store = { read(key, fallback) { return saved[key] === undefined ? fallback : saved[key]; }, write(key, value) { saved[key] = value; }, getSettings() { return { sound: true, vibration: false }; }, feedback() {} };
  const fakeDate = class extends Date { static now(){return now;} };
  vm.runInNewContext(fs.readFileSync(pageFile, 'utf8'), {
    Page(value) { definition = value; }, wx, Date:fakeDate,
    require(name) {
      if(name.endsWith('party-rules'))return rules;
      if(name.endsWith('/ads'))return adOverrides || {shouldOffer(){return false;},recordRound(){},controller(){return{play(done){done();},cancel(){},dispose(){}};}};
      if(name.endsWith('storage'))return store;
      if(name.endsWith('layout'))return {metrics(){return {safeTop:24,navHeight:44,scale:1,windowHeight:812};}};
      if(name==='./effects')return realEffects;
      if(name.endsWith('questions'))return questions;
      throw new Error('Unmapped Page dependency: '+name);
    },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay, due:now+delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)), setData(value,callback) { Object.assign(this.data, value);if(callback)callback.call(this); } });
  page.onLoad({ type });
  return {
    page, saved, timers, audio, nativeEvents, wx, frames, canvases, queries,
    tick() { const item=Array.from(timers.entries()).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];if(item){timers.delete(item[0]);now=Math.max(now,item[1].due);item[1].callback();} },
    frame(elapsed=16) { now+=elapsed;const queue=Array.from(frames.entries());queue.forEach(([id])=>frames.delete(id));queue.forEach(([,item])=>item.callback(now)); },
    now(){return now;}
  };
}
test('真实页面鲨鱼连按锁，切后台清理回调且恢复不会卡住', () => {
  const context = game('sharkTeeth');
  const { page } = context;
  page.start();
  const safe = page._round.badTooth === 0 ? 1 : 0;
  page.pressTooth({ currentTarget: { dataset: { index: safe } } });
  assert.equal(page.data.locked, true);
  const player = page.data.currentPlayer;
  page.pressTooth({ currentTarget: { dataset: { index: 2 } } });
  assert.equal(page.data.currentPlayer, player);
  page.onHide();
  assert.equal(context.timers.size, 0);
  assert.equal(page.data.locked, false);
  assert.ok(context.audio.stops > 0);
  page.onShow();
  page.pressTooth({ currentTarget: { dataset: { index: page._round.badTooth } } });
  assert.equal(page.data.phase, 'biting');
  page.onHide();
  assert.equal(page.data.phase, 'result');
  assert.equal(context.timers.size, 0);
});
test('真实页面气球三秒开局，切后台取消且旧回调不继续爆炸', () => {
  const context = game('passBalloon');
  const { page } = context;
  page.start();
  assert.equal(page.data.countdown, 3);
  context.tick(); context.tick();
  assert.equal(page.data.countdown, 1);
  context.tick();
  assert.equal(page.data.phase, 'playing');
  assert.ok(page._balloonTime >= 20 && page._balloonTime <= 55);
  const stale = context.timers.values().next().value.callback;
  page.onHide();
  assert.equal(page.data.phase, 'ready');
  assert.equal(context.timers.size, 0);
  stale();
  assert.equal(page.data.phase, 'ready');
});
test('真实页面气球随机时刻爆炸、结束状态可重玩，长按可取消', () => {
  const context = game('passBalloon');
  const { page } = context;
  page.start(); context.tick(); context.tick(); context.tick();
  const duration = page._balloonTime;
  for (let i = 0; i < duration - 1; i += 1) context.tick();
  assert.equal(page.data.phase, 'playing');
  context.tick();
  assert.equal(page.data.phase, 'exploding');
  context.tick();
  assert.equal(page.data.phase, 'result');
  page.start(); context.tick(); context.tick(); context.tick();
  page.beginHold();
  // 虚拟时钟按真实到期顺序先执行 800ms 长按，取消尚未到期的气球 tick。
  context.tick();
  assert.equal(page.data.phase, 'ready');
  assert.equal(context.timers.size, 0);
});
test('真实页面数字炸弹键盘输入、交接、揭晓结果保持一致', () => {
  const context = game('numberBomb');
  const { page } = context;
  page.start();
  page._round.secret = 1;
  page.keyPress({ currentTarget: { dataset: { key: '2' } } });
  assert.equal(page.data.canSubmit, true);
  page.submitGuess();
  assert.equal(page.data.phase, 'lastReveal');
  page.revealLast();
  assert.equal(page.data.phase, 'exploding');
  assert.equal(page.data.secret, 1);
  assert.equal(page.data.loser, 2);
  context.tick(); context.tick();
  assert.equal(page.data.phase, 'result');
  page.start();
  assert.equal(page.data.phase, 'input');
});
test('真实页面题库初始化与换题持久保存、后台取消动画', () => {
  const context = game('truthDare');
  const { page } = context;
  const first = page.data.question;
  page.nextQuestion();
  assert.notEqual(page.data.question, first);
  assert.equal(context.saved['party:questions-truths'].seen.length, 2);
  context.tick();
  page.switchTruth({ currentTarget: { dataset: { mode: 'dares' } } });
  assert.ok(questions.dares.includes(page.data.question));
  assert.equal(context.saved['party:questions-dares'].seen.length, 1);
  page.onHide();
  assert.equal(page.data.flipping, false);
  assert.equal(context.timers.size, 0);
});

test('真心话上滑超过80px或速度180px/s甩出旧题，动画完成前锁住切换', () => {
 const context=game('truthDare');const {page}=context;const old=page.data.question;
 page.cardTouchStart({touches:[{clientY:500}]});
 page.cardTouchMove({touches:[{clientY:410}]});
 page._dragVelocity=0;page.cardTouchEnd();
 assert.equal(page.data.flipping,true);assert.equal(page.data.outgoingQuestion,old);assert.notEqual(page.data.question,old);
 page.switchTruth({currentTarget:{dataset:{mode:'dares'}}});assert.equal(page.data.truth,true);
 context.tick();assert.equal(page.data.flipping,false);assert.equal(page.data.outgoingQuestion,'');assert.equal(page.data.dragY,0);
 page.cardTouchStart({touches:[{clientY:500}]});page.cardTouchMove({touches:[{clientY:470}]});page._dragVelocity=-181;page._lastDragTime=context.now();page.cardTouchEnd();assert.equal(page.data.flipping,true);
});
test('真心话小幅慢拖释放弹回而不抽题，触摸取消和后台清理恢复状态', () => {
 const context=game('truthDare');const {page}=context;const old=page.data.question;
 page.cardTouchStart({touches:[{clientY:500}]});page.cardTouchMove({touches:[{clientY:460}]});page._dragVelocity=0;page.cardTouchEnd();
 assert.equal(page.data.returning,true);assert.equal(page.data.question,old);assert.equal(page.data.dragY,0);context.tick();assert.equal(page.data.returning,false);
 page.cardTouchStart({touches:[{clientY:500}]});page.cardTouchMove({touches:[{clientY:480}]});page.cardTouchCancel();assert.equal(page.data.returning,true);page.onHide();assert.equal(page.data.returning,false);assert.equal(page._dragging,false);assert.equal(context.timers.size,0);
});

test('原生返回询问随active/result/后台与恢复同步，idle不弹', () => {
 const context=game('sharkTeeth');const {page}=context;
 assert.equal(context.nativeEvents.at(-1).type,'disable');
 page.onShow();page.start();assert.equal(context.nativeEvents.at(-1).type,'enable');assert.equal(page._nativeGuardEnabled,true);
 page.pressTooth({currentTarget:{dataset:{index:page._round.badTooth}}});context.tick();
 assert.equal(page.data.phase,'result');assert.equal(context.nativeEvents.at(-1).type,'disable');
 page.start();page.onHide();assert.equal(context.nativeEvents.at(-1).type,'disable');
 page.onShow();assert.equal(context.nativeEvents.at(-1).type,'enable');
 page.adjust();assert.equal(context.nativeEvents.at(-1).type,'disable');
 page.onUnload();assert.equal(context.nativeEvents.at(-1).type,'disable');
});
test('气球切后台取消后恢复保持idle，数字爆炸期间guard不中断到结果再禁用', () => {
 const balloon=game('passBalloon');balloon.page.start();assert.equal(balloon.page._nativeGuardEnabled,true);
 balloon.page.onHide();balloon.page.onShow();assert.equal(balloon.page.data.phase,'ready');assert.equal(balloon.page._nativeGuardEnabled,false);
 const bomb=game('numberBomb');bomb.page.start();bomb.page._round.secret=1;
 bomb.page.keyPress({currentTarget:{dataset:{key:'1'}}});const count=bomb.nativeEvents.length;bomb.page.submitGuess();
 assert.equal(bomb.page.data.phase,'exploding');assert.equal(bomb.page._nativeGuardEnabled,true);assert.equal(bomb.nativeEvents.length,count);
 bomb.tick();bomb.tick();assert.equal(bomb.page.data.phase,'result');assert.equal(bomb.page._nativeGuardEnabled,false);
});
test('自定义确认离开等待disable完成后才导航，避免原生二次确认', () => {
 const context=game('sharkTeeth');const {page}=context;page.start();page.requestBack();assert.equal(page.data.exitOpen,true);
 let disabledComplete;
 context.wx.disableAlertBeforeUnload=options=>{context.nativeEvents.push({type:'disable-pending'});disabledComplete=options.complete;};
 page.confirmExit();assert.equal(page._active,false);assert.equal(page._nativeGuardEnabled,false);assert.notEqual(context.nativeEvents.at(-1).type,'navigateBack');
 disabledComplete();assert.equal(context.nativeEvents.at(-1).type,'navigateBack');assert.equal(page.data.exitOpen,false);
 const count=context.nativeEvents.length;disabledComplete();page.confirmExit();assert.equal(context.nativeEvents.length,count);
});
test('旧基础库没有返回询问API也保留自定义确认，真心话完成重开先禁用再返回', () => {
 const legacy=game('numberBomb',{}, {enableAlertBeforeUnload:undefined,disableAlertBeforeUnload:undefined});legacy.page.start();legacy.page.requestBack();assert.equal(legacy.page.data.exitOpen,true);legacy.page.confirmExit();assert.equal(legacy.nativeEvents.at(-1).type,'navigateBack');
 const truth=game('truthDare');truth.page.data.origin='sharkTeeth';truth.page.getOpenerEventChannel=()=>({emit(name){truth.nativeEvents.push({type:name});}});
 truth.page.finishPunishment();assert.deepEqual(truth.nativeEvents.slice(-3).map(event=>event.type),['disable','restart','navigateBack']);
});

test('长按真实Canvas2D环被绘制，800ms完成后取消RAF并解绑', () => {
 const context=game('passBalloon');const {page}=context;page.start();context.tick();context.tick();context.tick();
 const started=context.now();page.beginHold();
 const canvas=context.canvases.get('#hold-effects');assert.ok(canvas);assert.deepEqual(canvas.contextTypes,['2d']);
 assert.equal(canvas.width,244);assert.equal(canvas.height,244);assert.equal(context.queries.at(-1).fields.node,true);
 context.frame(400);assert.ok(canvas.commands.some(command=>command.method==='arc'));assert.ok(canvas.commands.some(command=>command.method==='stroke'));
 const stale=context.frames.values().next().value.callback;
 context.tick();assert.equal(context.now()-started,800);assert.equal(page.data.phase,'ready');assert.equal(page.data.holding,false);
 assert.equal(page._effectCanvas,null);assert.equal(context.frames.size,0);assert.equal(context.timers.size,0);
 const drawn=canvas.commands.length;stale();assert.equal(canvas.commands.length,drawn);
});
test('真实数字爆炸绘制路径可执行，打开modal后取消FX且旧帧失效', () => {
 const context=game('numberBomb');const {page}=context;page.start();page._round.secret=1;page.keyPress({currentTarget:{dataset:{key:'1'}}});page.submitGuess();
 const canvas=context.canvases.get('#bomb-effects');assert.ok(canvas);assert.deepEqual(canvas.contextTypes,['2d']);assert.equal(canvas.width,688);
 context.frame(450);assert.ok(canvas.commands.some(command=>command.method==='fill'));assert.ok(canvas.commands.some(command=>command.method==='stroke'));
 const stale=context.frames.values().next().value.callback,drawn=canvas.commands.length;
 page.help();assert.equal(page.data.introShow,true);assert.equal(page._effectCanvas,null);assert.equal(context.frames.size,0);
 stale();assert.equal(canvas.commands.length,drawn);
 page.onUnload();assert.equal(context.timers.size,0);assert.equal(context.frames.size,0);
});
test('气球真实爆裂Canvas2D完成一帧绘制，后台清理并丢弃旧帧', () => {
 const context=game('passBalloon');const {page}=context;page.start();context.tick();context.tick();context.tick();page._balloonTime=1;context.tick();
 const canvas=context.canvases.get('#balloon-effects');assert.ok(canvas);assert.deepEqual(canvas.contextTypes,['2d']);assert.equal(canvas.width,750);assert.equal(canvas.height,976);
 context.frame(250);assert.ok(canvas.commands.some(command=>command.method==='quadraticCurveTo'));assert.ok(canvas.commands.some(command=>command.method==='fill'));
 const stale=context.frames.values().next().value.callback,drawn=canvas.commands.length;
 page.onHide();assert.equal(page.data.phase,'ready');assert.equal(page._effectCanvas,null);assert.equal(context.frames.size,0);assert.equal(context.timers.size,0);
 stale();assert.equal(canvas.commands.length,drawn);
});

test('真实开始入口命中概率后只请求一次插屏，关闭后开始新局', () => {
  let rounds=0,requests=0,close,offer=false;
  const ads={shouldOffer(){return offer;},recordRound(){rounds++;},controller(){return{play(done){requests++;close=done;},cancel(){},dispose(){}};}};
  const {page}=game('sharkTeeth',{}, {},ads);
  page.start();assert.equal(requests,0);
  page._round.phase='result';page._syncShark();page._syncShark();assert.equal(rounds,1);offer=true;
  page.start();page.start();assert.equal(requests,1);assert.equal(page.data.phase,'result');
  close();assert.equal(page.data.phase,'playing');assert.equal(page._adGate,false);
});
test('局间等待广告时退出页面，迟到关闭不能启动旧局；换题也不请求插屏', () => {
  let close,requests=0;
  let offer=false;const ads={shouldOffer(){return offer;},recordRound(){},controller(){return{play(done){requests++;close=done;},cancel(){},dispose(){}};}};
  const {page}=game('numberBomb',{}, {},ads);page.start();page.setData({phase:'result'});offer=true;page.start();page.onHide();close();
  assert.equal(page.data.phase,'result');assert.equal(page._active,false);
  const truth=game('truthDare',{}, {},ads);truth.page._drawQuestion(false);assert.equal(requests,1);truth.page.onUnload();
});

test('传气球、数字炸弹、鲨鱼开始与再玩共用一次随机判断，未命中直接开始',()=>{
  for(const type of ['passBalloon','numberBomb','sharkTeeth']){
    for(const phase of [type==='passBalloon'?'ready':'setup','result']){
      let decisions=0,requests=0,offer=true,close,placement;
      const ads={recordRound(){},shouldOffer(key){assert.equal(key,type);decisions++;return offer;},controller(){return{play(done,options){requests++;placement=options.placement;close=done;},cancel(){},dispose(){}};}};
      const {page}=game(type,{}, {},ads);page.setData({phase});page.start();page.start();
      assert.equal(requests,1);assert.equal(decisions,1);assert.equal(placement,type);assert.equal(page.data.phase,phase);
      close();assert.equal(page.data.phase,{passBalloon:'countdown',numberBomb:'input',sharkTeeth:'playing'}[type]);
      page.onHide();page.onShow();page.adjust();offer=false;page.start();assert.equal(requests,1);assert.equal(decisions,2);
      page.onUnload();
    }
  }
});
test('三个开始入口等待插屏时退后台，迟到关闭不能启动旧局',()=>{
  for(const type of ['passBalloon','numberBomb','sharkTeeth']){
    let close;const ads={recordRound(){},shouldOffer(){return true;},controller(){return{play(done){close=done;},cancel(){},dispose(){}};}};
    const {page,timers}=game(type,{}, {},ads);const phase=page.data.phase;page.start();page.onHide();close();
    assert.equal(page.data.phase,phase);assert.equal(page._adGate,false);assert.equal(timers.size,0);page.onUnload();
  }
});
test('题库题材调整后保留仍存在的已读进度，移除旧题并让新题进入本轮',()=>{
  const cases=[
    {source:questions.truths,kept:'你希望下一次心动时，自己和过去相比有什么不同？',removed:'你会不会在发动态前，特意检查某个人能不能看到？',added:'如果能永久免除一项家务，你会选哪项？为什么？'},
    {source:questions.dares,kept:'用拍卖师的口吻，拍卖自己一个很没用但很有趣的技能。',removed:'用机器人刚学会人类感情的语气，解释什么叫“口是心非”。',added:'推销一种超能力：能准确知道每只蚊子的位置，但不能让它们消失。'}
  ];
  for(const {source,kept,removed,added} of cases){
    assert.ok(source.includes(kept));assert.ok(!source.includes(removed));assert.ok(source.includes(added));
    const deck=new rules.QuestionDeck(source,{seen:[kept,removed],lastQuestion:removed},()=>.5);
    assert.deepEqual(deck.progress().seen,[kept]);
    const remaining=Array.from({length:source.length-1},()=>deck.draw());
    assert.equal(new Set(remaining).size,source.length-1);assert.ok(remaining.includes(added));assert.ok(!remaining.includes(kept));assert.ok(!remaining.includes(removed));
  }
});

// 从 Flutter party_game_vms.dart / truth_dare_repository.dart 迁移的纯规则。
function clamp(value, min, max) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? Math.round(number) : min));
}
function randomInt(min, max, random = Math.random) {
  return min + Math.min(max - min, Math.floor(Math.max(0, random()) * (max - min + 1)));
}
function sharkToothCount(players) {
  const count = clamp(players, 2, 12);
  return count <= 4 || count === 6 ? 12 : count === 5 ? 10 : count;
}
function createSharkRound(players, random = Math.random) {
  const count = clamp(players, 2, 12);
  const teeth = sharkToothCount(count);
  return { players: count, phase: 'playing', currentPlayer: 0, loser: null, badTooth: randomInt(0, teeth - 1, random), pressed: Array(teeth).fill(false) };
}
function pressSharkTooth(round, index) {
  if (round.phase !== 'playing' || !Number.isInteger(index) || index < 0 || index >= round.pressed.length || round.pressed[index]) return round;
  const pressed = round.pressed.slice();
  pressed[index] = true;
  if (index === round.badTooth) return Object.assign({}, round, { pressed, loser: round.currentPlayer, phase: 'biting' });
  return Object.assign({}, round, { pressed, currentPlayer: (round.currentPlayer + 1) % round.players });
}
function createBombRound(players, maxNumber, random = Math.random) {
  const max = [50, 100, 200].includes(Number(maxNumber)) ? Number(maxNumber) : 100;
  return { players: clamp(players, 2, 8), maxNumber: max, currentPlayer: 0, lower: 0, upper: max + 1, secret: randomInt(1, max, random), attempts: 0, loser: null, phase: 'input', error: '' };
}
function submitNumberGuess(round, raw) {
  if (round.phase !== 'input') return round;
  const value = String(raw).trim();
  const guess = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(guess) || guess <= round.lower || guess >= round.upper) {
    return Object.assign({}, round, { error: `请输入 ${round.lower + 1} - ${round.upper - 1} 之间的整数` });
  }
  const next = Object.assign({}, round, { attempts: round.attempts + 1, error: '' });
  if (guess === round.secret) return Object.assign(next, { loser: round.currentPlayer, phase: 'result' });
  if (guess < round.secret) next.lower = guess;
  else next.upper = guess;
  next.currentPlayer = (round.currentPlayer + 1) % round.players;
  next.phase = next.upper - next.lower === 2 ? 'lastReveal' : 'handoff';
  return next;
}
function shuffle(values, random = Math.random) {
  const bag = values.slice();
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i, random);
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
class QuestionDeck {
  constructor(source, progress = {}, random = Math.random) {
    progress = progress && typeof progress === 'object' ? progress : {};
    this.source = Array.from(new Set((Array.isArray(source) ? source : []).filter(question => typeof question === 'string' && question.trim())));
    this.random = random;
    this.seen = new Set(Array.isArray(progress.seen) ? progress.seen.filter(question => this.source.includes(question)) : []);
    this.lastQuestion = typeof progress.lastQuestion === 'string' ? progress.lastQuestion : '';
    this.bag = shuffle(this.source.filter(question => !this.seen.has(question)), random);
  }
  draw() {
    if (!this.source.length) return '';
    if (!this.bag.length) {
      this.seen.clear();
      this.bag = shuffle(this.source, this.random);
    }
    const last = this.bag.length - 1;
    if (last > 0 && this.bag[last] === this.lastQuestion) [this.bag[0], this.bag[last]] = [this.bag[last], this.bag[0]];
    const question = this.bag.pop();
    this.seen.add(question);
    this.lastQuestion = question;
    return question;
  }
  progress() { return { seen: Array.from(this.seen), lastQuestion: this.lastQuestion }; }
}
const BALLOON_RANGES = [[12, 40], [20, 55], [30, 75]];
function balloonDuration(pace, random = Math.random) {
  const range = BALLOON_RANGES[clamp(pace, 0, 2)];
  return randomInt(range[0], range[1], random);
}
module.exports = { clamp, randomInt, sharkToothCount, createSharkRound, pressSharkTooth, createBombRound, submitNumberGuess, QuestionDeck, balloonDuration, BALLOON_RANGES };

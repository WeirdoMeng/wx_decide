import { BilliardsPhysics, SNOOKER_POCKETS, type Vec2, type PhysicsEvent } from "./game/physics";
import { SnookerMatch, COLOR_IDS, type ColorId, type ShotReport, type ShotContext } from "./game/snookerRules";
import { EightBallMatch, type PoolContext, type PoolReport } from "./game/eightBallRules";
import { SnookerAiPlanner, type AiDifficulty } from "./game/ai";
import { CueStrokeAnimation } from "./game/cueStroke";
export { BilliardsPhysics, SNOOKER_POCKETS, SnookerMatch, EightBallMatch, SnookerAiPlanner, CueStrokeAnimation };
export type { Vec2 };
export { createWechatWebGLAdapter, prepareWebGL1Shader } from "./platform";
export { CanvasBilliardsHud } from "./hud";
export { beginRearAimDrag, updateRearAimDirection } from "./game/aimControl";
export class BilliardsSession {
  physics: BilliardsPhysics;
  match: SnookerMatch | EightBallMatch;
  planner = new SnookerAiPlanner();
  stroke = new CueStrokeAnimation();
  angle = 0;
  power = 0.42;
  sideSpin = 0;
  followSpin = 0;
  ai = false;
  difficulty: AiDifficulty = "normal";
  paused = false;
  disposed = false;
  ballInHand = false;
  thinking = false;
  message = "拖动球桌瞄准，调整力度后击球";
  onChange?: (state: ReturnType<BilliardsSession["snapshot"]>) => void;
  onSound?: (type: string, strength: number) => void;
  private report?: PoolReport;
  private context?: ShotContext | PoolContext;
  private accumulator = 0;
  private aiAt = 0;
  private now = 0;
  constructor(public mode: "eight" | "snooker" = "eight") {
    this.physics = new BilliardsPhysics(mode);
    this.match = mode === "snooker" ? new SnookerMatch() : new EightBallMatch();
    this.physics.onEvent = (event) => this.event(event);
  }
  snapshot() {
    const state = this.match.snapshot();
    const aiTurn = this.ai && state.activePlayer === 1;
    return { ...state, mode: this.mode, ai: this.ai, difficulty: this.difficulty, message: this.message,
      paused: this.paused, ballInHand: this.ballInHand, thinking: this.thinking,
      moving: this.physics.isMoving() || Boolean(this.report) || this.stroke.isActive,
      canShoot: !this.paused && !this.ballInHand && !this.report && !this.stroke.isActive && !this.physics.isMoving() && !aiTurn && state.phase !== "finished",
      power: Math.round(this.power * 100), selectedColor: state.target === "red" ? "black" : (state as any).nominatedColor ?? "black" };
  }
  notify() { if (!this.disposed) this.onChange?.(this.snapshot()); }
  setPower(value: number) { if (this.canControl()) { this.power = Math.max(.08, Math.min(1, value)); this.notify(); } }
  setAngle(angle: number) { if (this.canControl()) this.angle = angle; }
  setSpin(x: number, y: number) { if (this.canControl()) { this.sideSpin = Math.max(-1, Math.min(1,x)); this.followSpin = Math.max(-1, Math.min(1,y)); } }
  nominate(color: ColorId) { if (this.canControl() && this.match instanceof SnookerMatch) { this.match.nominate(color); this.notify(); } }
  canControl() { return !this.paused && !this.disposed && !this.report && !this.stroke.isActive && !(this.ai && this.match.snapshot().activePlayer === 1) && this.match.snapshot().phase !== "finished"; }
  shoot(): boolean {
    if (!this.snapshot().canShoot) return false;
    return this.beginStroke({ x: Math.cos(this.angle), z: Math.sin(this.angle) }, this.power, this.sideSpin, this.followSpin);
  }
  private beginStroke(direction: Vec2, power: number, side: number, follow: number): boolean {
    const context = this.match.beginShot();
    if (!context) return false;
    this.angle = Math.atan2(direction.z, direction.x);
    this.power = power;
    const accepted = this.stroke.start({ power, commit: () => {
      if (this.paused || this.disposed) return;
      this.context = context;
      this.report = { potted: [], objectRails: [], railAfterContact: false };
      if (!this.physics.shoot(direction, power, side, follow)) { this.report = undefined; this.context = undefined; }
      else { this.onSound?.("cue", power); this.message = "球在运行中…"; }
      this.notify();
    } }, this.now);
    this.notify();
    return accepted;
  }
  private event(event: PhysicsEvent) {
    const report = this.report;
    if (event.type === "impact") {
      if (report && !report.firstContact && event.balls.includes("cue")) report.firstContact = event.balls.find((id) => id !== "cue");
      this.onSound?.("impact", event.strength);
    } else if (event.type === "cushion") {
      if (report?.firstContact) { report.railAfterContact = true; if (event.ball !== "cue") report.objectRails.push(event.ball); }
      this.onSound?.("cushion", event.strength);
    } else {
      if (report) report.potted.push(event.ball.id);
      this.onSound?.("pocket", .7);
    }
  }
  update(dt: number, now: number) {
    this.now = now;
    if (this.disposed || this.paused) return;
    this.stroke.update(now);
    this.accumulator += Math.max(0, Math.min(.05, dt));
    while (this.accumulator >= 1 / 120) { this.physics.step(1 / 120); this.accumulator -= 1 / 120; }
    if (this.report && !this.physics.isMoving()) this.finishShot();
    this.updateAi(now);
  }
  private finishShot() {
    const context = this.context!, report = this.report!;
    if (this.match instanceof SnookerMatch) {
      const decision = this.match.resolveShot(context as ShotContext, report as ShotReport);
      for (const id of decision.respot) this.physics.respotColor(id);
      this.ballInHand = this.physics.cueBall.pocketed;
      this.message = decision.message + (this.ballInHand ? " · 在 D 区点击摆放母球" : "");
    } else {
      const decision = this.match.resolveShot(context as PoolContext, report);
      if (decision.respotEight) this.physics.respotEight();
      this.ballInHand = decision.ballInHand;
      if (this.ballInHand) this.physics.cueBall.pocketed = true;
      this.message = decision.message;
    }
    this.report = undefined; this.context = undefined; this.aiAt = 0;
    this.notify();
  }
  placeCue(position: Vec2): boolean {
    if (!this.ballInHand || !this.canControl() || !this.physics.placeCue(position)) return false;
    this.ballInHand = false; this.message = "母球已摆好，可以击球"; this.notify(); return true;
  }
  private aiPlacement(): boolean {
    if (!this.ballInHand) return true;
    let position = this.planner.chooseCuePlacement((p) => this.physics.canPlaceCue(p));
    if (!position) for (let x = -1.6; x <= 1.6 && !position; x += .08) for (let z = -.78; z <= .78 && !position; z += .08) if (this.physics.canPlaceCue({x,z})) position = {x,z};
    if (!position || !this.physics.placeCue(position)) return false;
    this.ballInHand = false; return true;
  }
  private updateAi(now: number) {
    const state = this.match.snapshot();
    if (!this.ai || state.activePlayer !== 1 || state.phase === "finished" || this.report || this.stroke.isActive || this.physics.isMoving()) return;
    if (!this.aiAt) { this.aiAt = now + this.planner.thinkDelay(this.difficulty); this.thinking = true; this.message = "AI 正在观察球路…"; this.notify(); return; }
    if (now < this.aiAt) return;
    this.aiAt = 0; this.thinking = false;
    if (!this.aiPlacement()) { this.message = "暂无合法摆球位置，请重新开局"; this.notify(); return; }
    if (this.match instanceof SnookerMatch && state.phase === "reds" && state.target !== "red") this.match.nominate(this.planner.chooseNomination(this.physics.balls, this.physics.radius, this.physics.halfX, this.physics.halfZ, this.difficulty));
    const target = this.match.snapshot().target;
    const plan = target ? this.planner.plan({ balls: this.physics.balls, target: target as any, radius: this.physics.radius, halfX: this.physics.halfX, halfZ: this.physics.halfZ, difficulty: this.difficulty }) : undefined;
    if (plan) this.beginStroke(plan.direction, plan.power, plan.sideSpin, plan.followSpin);
    else {
      // If every direct line is blocked, attempt a real shot; the same rules judge any foul.
      const cue = this.physics.cueBall, ball = this.physics.balls.find((b) => !b.pocketed && b.id !== "cue" && (target === "open" ? b.kind === "solid" || b.kind === "stripe" : target === "red" ? b.kind === "red" : target === "solid" || target === "stripe" || target === "eight" ? b.kind === target : b.id === target));
      if (ball) this.beginStroke({ x: ball.position.x - cue.position.x, z: ball.position.z - cue.position.z }, .48, 0, 0);
    }
    this.notify();
  }
  setOpponent(ai: boolean) { this.cancelPending(); this.ai = ai; this.notify(); }
  setDifficulty(value: AiDifficulty) { if (["easy","normal","hard"].includes(value)) { this.cancelPending(); this.difficulty = value; this.notify(); } }
  private cancelPending() { this.stroke.cancel(); this.aiAt = 0; this.thinking = false; }
  pause() { this.paused = true; this.accumulator = 0; this.cancelPending(); this.notify(); }
  resume() { this.paused = false; this.accumulator = 0; this.notify(); }
  restart() { this.cancelPending(); this.physics.reset(); this.match.reset(); this.report = undefined; this.context = undefined; this.ballInHand = false; this.paused = false; this.angle = 0; this.sideSpin = 0; this.followSpin = 0; this.accumulator = 0; this.message = "新的一局 · 拖动球桌瞄准"; this.notify(); }
  dispose() { this.disposed = true; this.cancelPending(); this.onChange = undefined; this.onSound = undefined; this.physics.onEvent = undefined; }
}

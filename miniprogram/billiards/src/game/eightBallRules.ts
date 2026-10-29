import type { BallState } from "./physics";
export type PoolGroup = "solid" | "stripe";
export type PoolTarget = PoolGroup | "eight" | "open";
export type PoolContext = { player: 0 | 1; target: PoolTarget; breaking: boolean };
export type PoolReport = { firstContact?: string; potted: string[]; railAfterContact: boolean; objectRails: string[] };
export const poolKind = (id?: string): PoolTarget | undefined => {
  if (!id?.startsWith("pool-")) return undefined;
  const n = Number(id.slice(5));
  return n === 8 ? "eight" : n >= 1 && n <= 7 ? "solid" : n >= 9 && n <= 15 ? "stripe" : undefined;
};
/** Local recreational eight-ball: legal break requires a pot or four object balls to rails;
 * black on break is respotted; all fouls give opponent ball in hand. No called pockets. */
export class EightBallMatch {
  activePlayer: 0 | 1 = 0;
  groups: [PoolGroup | null, PoolGroup | null] = [null, null];
  finished = false;
  winner: 0 | 1 | null = null;
  breaking = true;
  private sunk = new Set<string>();
  reset() { this.activePlayer = 0; this.groups = [null, null]; this.finished = false; this.winner = null; this.breaking = true; this.sunk.clear(); }
  target(player = this.activePlayer): PoolTarget {
    const group = this.groups[player];
    return group === null ? "open" : this.remaining(group) === 0 ? "eight" : group;
  }
  remaining(group: PoolGroup): number { return 7 - [...this.sunk].filter((id) => poolKind(id) === group).length; }
  beginShot(): PoolContext | null { return this.finished ? null : { player: this.activePlayer, target: this.target(), breaking: this.breaking }; }
  snapshot() {
    const target = this.target();
    return { players: this.groups.map((g) => g ? 7 - this.remaining(g) : 0), activePlayer: this.activePlayer,
      phase: this.finished ? "finished" : "playing", target, targetLabel: this.finished ? "本局结束" : this.breaking ? "开球" : target === "open" ? "开放球台" : target === "eight" ? "黑8" : target === "solid" ? "全色球 1–7" : "花色球 9–15", winner: this.winner, groups: [...this.groups] };
  }
  resolveShot(context: PoolContext, report: PoolReport) {
    if (this.finished || context.player !== this.activePlayer) return { foul: false, respotEight: false, ballInHand: false, message: "本局已结束", matchEnded: this.finished };
    const opponent = context.player === 0 ? 1 : 0;
    const first = poolKind(report.firstContact);
    const objectPots = report.potted.filter((id) => poolKind(id));
    const scratch = report.potted.includes("cue");
    const wrongContact = !first || (context.target === "open" ? first === "eight" : first !== context.target);
    const badBreak = context.breaking && objectPots.length === 0 && new Set(report.objectRails).size < 4;
    const noRail = objectPots.length === 0 && !report.railAfterContact;
    const foul = scratch || wrongContact || badBreak || noRail;
    const blackPotted = report.potted.includes("pool-8");
    const respotEight = context.breaking && blackPotted;
    for (const id of objectPots) if (id !== "pool-8") this.sunk.add(id);
    if (blackPotted && !context.breaking) {
      this.finished = true;
      this.winner = context.target === "eight" && !foul ? context.player : opponent;
      return { foul, respotEight: false, ballInHand: false, message: this.winner === context.player ? "黑8入袋 · 获胜" : "黑8提前入袋或犯规 · 对手获胜", matchEnded: true };
    }
    if (!foul && !context.breaking && this.groups[context.player] === null) {
      const group = objectPots.map(poolKind).find((g): g is PoolGroup => g === "solid" || g === "stripe");
      if (group) { this.groups[context.player] = group; this.groups[opponent] = group === "solid" ? "stripe" : "solid"; }
    }
    const ownPot = objectPots.some((id) => { const kind = poolKind(id); return kind !== "eight" && (this.groups[context.player] === null || kind === this.groups[context.player]); });
    if (foul || !ownPot) this.activePlayer = opponent;
    this.breaking = false;
    return { foul, respotEight, ballInHand: foul, message: foul ? `犯规 · ${scratch ? "母球落袋" : wrongContact ? "首碰错误或未碰球" : badBreak ? "开球不足四球碰库" : "未进球且无球碰库"}，对手自由球` : ownPot ? "合法进球 · 继续击球" : "交换击球权", matchEnded: false };
  }
}

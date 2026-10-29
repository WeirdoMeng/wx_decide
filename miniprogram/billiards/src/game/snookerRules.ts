export const COLOR_IDS = ["yellow", "green", "brown", "blue", "pink", "black"] as const;
export type ColorId = typeof COLOR_IDS[number];
export type ObjectBallId = "red" | ColorId;
export type MatchPhase = "reds" | "colors" | "finished";

export const BALL_VALUES: Record<ObjectBallId, number> = {
  red: 1,
  yellow: 2,
  green: 3,
  brown: 4,
  blue: 5,
  pink: 6,
  black: 7,
};

const BALL_LABELS: Record<ObjectBallId, string> = {
  red: "红球",
  yellow: "黄球",
  green: "绿球",
  brown: "棕球",
  blue: "蓝球",
  pink: "粉球",
  black: "黑球",
};

export type ShotContext = {
  player: 0 | 1;
  phase: Exclude<MatchPhase, "finished">;
  target: ObjectBallId;
};

export type ShotReport = {
  firstContact?: string;
  potted: string[];
};

export type ShotDecision = {
  foul: boolean;
  points: number;
  penalty: number;
  turnContinues: boolean;
  respot: ColorId[];
  message: string;
  matchEnded: boolean;
};

export type MatchSnapshot = {
  players: readonly [number, number];
  activePlayer: 0 | 1;
  phase: MatchPhase;
  target: ObjectBallId | null;
  targetLabel: string;
  nominatedColor: ColorId;
  redsRemaining: number;
  winner: 0 | 1 | null;
};

function objectId(ballId: string | undefined): ObjectBallId | undefined {
  if (!ballId || ballId === "cue") return undefined;
  if (ballId.startsWith("red-")) return "red";
  return COLOR_IDS.includes(ballId as ColorId) ? ballId as ColorId : undefined;
}

function uniqueColors(ids: string[]): ColorId[] {
  return [...new Set(ids.filter((id): id is ColorId => COLOR_IDS.includes(id as ColorId)))];
}

export function sortColorsForRespot(colors: readonly ColorId[]): ColorId[] {
  return [...new Set(colors)].sort((a, b) => BALL_VALUES[b] - BALL_VALUES[a]);
}

export class SnookerMatch {
  private scores: [number, number] = [0, 0];
  private striker: 0 | 1 = 0;
  private currentPhase: MatchPhase = "reds";
  private onBall: ObjectBallId = "red";
  private selectedColor: ColorId = "black";
  private redCount = 15;
  private clearanceIndex = 0;
  private matchWinner: 0 | 1 | null = null;

  reset(): void {
    this.scores = [0, 0];
    this.striker = 0;
    this.currentPhase = "reds";
    this.onBall = "red";
    this.selectedColor = "black";
    this.redCount = 15;
    this.clearanceIndex = 0;
    this.matchWinner = null;
  }

  nominate(color: ColorId): void {
    if (this.currentPhase === "reds" && this.onBall !== "red") this.selectedColor = color;
  }

  beginShot(): ShotContext | null {
    if (this.currentPhase === "finished") return null;
    return {
      player: this.striker,
      phase: this.currentPhase,
      target: this.target(),
    };
  }

  snapshot(): MatchSnapshot {
    const target = this.currentPhase === "finished" ? null : this.target();
    return {
      players: [...this.scores],
      activePlayer: this.striker,
      phase: this.currentPhase,
      target,
      targetLabel: target ? BALL_LABELS[target] : "对局结束",
      nominatedColor: this.selectedColor,
      redsRemaining: this.redCount,
      winner: this.matchWinner,
    };
  }

  resolveShot(context: ShotContext, report: ShotReport): ShotDecision {
    if (this.currentPhase === "finished" || context.player !== this.striker) {
      return { foul: false, points: 0, penalty: 0, turnContinues: false, respot: [], message: "本局已经结束", matchEnded: true };
    }

    const pottedObjects = report.potted.map(objectId).filter((id): id is ObjectBallId => Boolean(id));
    const pottedReds = report.potted.filter((id) => id.startsWith("red-")).length;
    const pottedColors = uniqueColors(report.potted);
    const first = objectId(report.firstContact);
    const cuePotted = report.potted.includes("cue");
    const wrongFirstContact = first !== context.target;
    const illegalPots = pottedObjects.filter((id) => id !== context.target);
    const foul = cuePotted || wrongFirstContact || illegalPots.length > 0;

    this.redCount = Math.max(0, this.redCount - pottedReds);

    if (foul) {
      const involvedValues = [
        BALL_VALUES[context.target],
        first ? BALL_VALUES[first] : 0,
        ...illegalPots.map((id) => BALL_VALUES[id]),
      ];
      const penalty = Math.max(4, ...involvedValues);
      const opponent = context.player === 0 ? 1 : 0;
      this.scores[opponent] += penalty;
      const reasons = [
        !first ? "未碰到任何球" : undefined,
        wrongFirstContact && first ? `首碰${BALL_LABELS[first]}` : undefined,
        cuePotted ? "母球落袋" : undefined,
        illegalPots.length ? "非目标球落袋" : undefined,
      ].filter(Boolean);
      this.advanceAfterFoul(context);
      this.striker = opponent;
      return {
        foul: true,
        points: 0,
        penalty,
        turnContinues: false,
        respot: sortColorsForRespot(pottedColors),
        message: `犯规 · ${reasons.join("、")}，对手 +${penalty}`,
        matchEnded: false,
      };
    }

    const targetPots = pottedObjects.filter((id) => id === context.target).length;
    const points = targetPots * BALL_VALUES[context.target];
    if (points > 0) this.scores[context.player] += points;

    if (context.phase === "reds") {
      if (context.target === "red" && targetPots > 0) {
        this.onBall = this.selectedColor;
      } else if (context.target !== "red") {
        if (this.redCount > 0) {
          this.onBall = "red";
        } else {
          this.enterClearance();
        }
      } else {
        this.onBall = "red";
      }
    } else if (targetPots > 0) {
      this.clearanceIndex += 1;
      if (this.clearanceIndex >= COLOR_IDS.length) this.finishMatch();
      else this.onBall = COLOR_IDS[this.clearanceIndex];
    }

    const matchEnded = this.isFinished();
    const turnContinues = points > 0 && !matchEnded;
    if (!turnContinues && !matchEnded) {
      this.striker = context.player === 0 ? 1 : 0;
      if (context.phase === "reds" && context.target !== "red" && this.redCount > 0) this.onBall = "red";
    }

    const respot = context.phase === "reds" ? sortColorsForRespot(pottedColors) : [];
    return {
      foul: false,
      points,
      penalty: 0,
      turnContinues,
      respot,
      message: points > 0 ? `${BALL_LABELS[context.target]}入袋 · +${points}` : "未得分 · 交换击球权",
      matchEnded,
    };
  }

  private target(): ObjectBallId {
    if (this.currentPhase === "colors") return COLOR_IDS[this.clearanceIndex];
    return this.onBall === "red" ? "red" : this.selectedColor;
  }

  private isFinished(): boolean {
    return this.currentPhase === "finished";
  }

  private advanceAfterFoul(context: ShotContext): void {
    if (context.phase === "colors") return;
    if (context.target === "red") {
      if (this.redCount === 0) this.enterClearance();
      else this.onBall = "red";
      return;
    }
    if (this.redCount === 0) this.enterClearance();
    else this.onBall = "red";
  }

  private enterClearance(): void {
    this.currentPhase = "colors";
    this.clearanceIndex = 0;
    this.onBall = COLOR_IDS[0];
  }

  private finishMatch(): void {
    this.currentPhase = "finished";
    this.matchWinner = this.scores[0] === this.scores[1] ? null : this.scores[0] > this.scores[1] ? 0 : 1;
  }
}

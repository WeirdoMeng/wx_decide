import type { BallState, Vec2 } from "./physics";
import { SNOOKER_POCKETS } from "./physics";
import { BALL_VALUES, COLOR_IDS, type ColorId, type ObjectBallId } from "./snookerRules";

export type AiDifficulty = "easy" | "normal" | "hard";
export type AiPlanKind = "pot" | "safety";

export type AiShotPlan = {
  direction: Vec2;
  power: number;
  sideSpin: number;
  followSpin: number;
  targetBallId: string;
  pocket?: Vec2;
  kind: AiPlanKind;
  score: number;
};

export type AiPlannerInput = {
  balls: readonly BallState[];
  target: ObjectBallId | "solid" | "stripe" | "eight" | "open";
  radius: number;
  halfX: number;
  halfZ: number;
  difficulty: AiDifficulty;
};

export type AiDifficultyProfile = {
  candidatePool: number;
  maxAngleError: number;
  maxPowerError: number;
  thinkDelayMs: readonly [number, number];
};

export const AI_DIFFICULTY: Record<AiDifficulty, AiDifficultyProfile> = {
  easy: { candidatePool: 5, maxAngleError: 0.06, maxPowerError: 0.11, thinkDelayMs: [420, 720] },
  normal: { candidatePool: 3, maxAngleError: 0.024, maxPowerError: 0.05, thinkDelayMs: [650, 980] },
  hard: { candidatePool: 1, maxAngleError: 0.007, maxPowerError: 0.018, thinkDelayMs: [900, 1250] },
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
const normalize = (direction: Vec2): Vec2 => {
  const length = Math.hypot(direction.x, direction.z) || 1;
  return { x: direction.x / length, z: direction.z / length };
};

function targetMatches(ball: BallState, target: AiPlannerInput["target"]): boolean {
  if (ball.pocketed || ball.kind === "cue") return false;
  if (target === "solid" || target === "stripe" || target === "eight") return ball.kind === target;
  if (target === "open") return ball.kind === "solid" || ball.kind === "stripe";
  return target === "red" ? ball.kind === "red" : ball.id === target;
}

function segmentClear(start: Vec2, end: Vec2, ignored: ReadonlySet<string>, balls: readonly BallState[], clearance: number): boolean {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-8) return false;
  return balls.every((ball) => {
    if (ball.pocketed || ignored.has(ball.id)) return true;
    const projection = clamp(((ball.position.x - start.x) * dx + (ball.position.z - start.z) * dz) / lengthSquared, 0, 1);
    const closest = { x: start.x + dx * projection, z: start.z + dz * projection };
    return distance(ball.position, closest) > clearance;
  });
}

function buildPotCandidates(input: AiPlannerInput, targetOverride?: AiPlannerInput["target"]): AiShotPlan[] {
  const target = targetOverride ?? input.target;
  const cue = input.balls.find((ball) => ball.id === "cue");
  if (!cue || cue.pocketed) return [];
  const candidates: AiShotPlan[] = [];
  const clearance = input.radius * 2.08;
  for (const ball of input.balls.filter((candidate) => targetMatches(candidate, target))) {
    for (const pocket of SNOOKER_POCKETS) {
      const objectToPocket = normalize({ x: pocket.x - ball.position.x, z: pocket.z - ball.position.z });
      const ghost = {
        x: ball.position.x - objectToPocket.x * input.radius * 2,
        z: ball.position.z - objectToPocket.z * input.radius * 2,
      };
      if (Math.abs(ghost.x) > input.halfX - input.radius || Math.abs(ghost.z) > input.halfZ - input.radius) continue;
      const cueToGhost = normalize({ x: ghost.x - cue.position.x, z: ghost.z - cue.position.z });
      const cutAlignment = cueToGhost.x * objectToPocket.x + cueToGhost.z * objectToPocket.z;
      if (cutAlignment < 0.22) continue;
      if (!segmentClear(cue.position, ghost, new Set(["cue", ball.id]), input.balls, clearance)) continue;
      if (!segmentClear(ball.position, pocket, new Set([ball.id, "cue"]), input.balls, clearance * 0.9)) continue;
      const cueDistance = distance(cue.position, ghost);
      const objectDistance = distance(ball.position, pocket);
      const score = cutAlignment * 5.4 - cueDistance * 0.72 - objectDistance * 0.56 + (BALL_VALUES[target as ObjectBallId] ?? 1) * 0.07;
      candidates.push({
        direction: cueToGhost,
        power: clamp(0.24 + cueDistance * 0.12 + objectDistance * 0.1 + (1 - cutAlignment) * 0.2, 0.25, 0.82),
        sideSpin: 0,
        followSpin: cutAlignment > 0.82 ? 0.08 : 0,
        targetBallId: ball.id,
        pocket: { x: pocket.x, z: pocket.z },
        kind: "pot",
        score,
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function buildSafety(input: AiPlannerInput): AiShotPlan | undefined {
  const cue = input.balls.find((ball) => ball.id === "cue");
  const targets = input.balls.filter((ball) => targetMatches(ball, input.target));
  if (!cue || cue.pocketed || targets.length === 0) return undefined;
  const firstBallOnRay = (direction: Vec2): BallState | undefined => {
    let nearest: { ball: BallState; distance: number } | undefined;
    for (const ball of input.balls) {
      if (ball.id === "cue" || ball.pocketed) continue;
      const dx = ball.position.x - cue.position.x;
      const dz = ball.position.z - cue.position.z;
      const projection = dx * direction.x + dz * direction.z;
      if (projection <= 0) continue;
      const perpendicularSquared = dx * dx + dz * dz - projection * projection;
      const collisionRadius = input.radius * 2;
      if (perpendicularSquared >= collisionRadius * collisionRadius) continue;
      const hitDistance = projection - Math.sqrt(collisionRadius * collisionRadius - perpendicularSquared);
      if (hitDistance > 0 && (!nearest || hitDistance < nearest.distance)) nearest = { ball, distance: hitDistance };
    }
    return nearest?.ball;
  };
  const legalContacts = targets.flatMap((ball) => {
    const base = Math.atan2(ball.position.z - cue.position.z, ball.position.x - cue.position.x);
    const distanceToBall = distance(cue.position, ball.position);
    const edgeAngle = Math.asin(Math.min(0.98, input.radius * 1.92 / distanceToBall));
    return [-0.92, -0.7, -0.45, 0, 0.45, 0.7, 0.92].map((factor) => {
      const angle = base + edgeAngle * factor;
      const direction = { x: Math.cos(angle), z: Math.sin(angle) };
      return { ball, direction, legal: firstBallOnRay(direction)?.id === ball.id, factor };
    }).filter((candidate) => candidate.legal);
  }).sort((a, b) => Math.abs(b.factor) - Math.abs(a.factor) || distance(b.ball.position, cue.position) - distance(a.ball.position, cue.position));
  const contact = legalContacts[0];
  if (!contact) return undefined;
  return {
    direction: contact.direction,
    power: 0.29,
    sideSpin: 0,
    followSpin: -0.08,
    targetBallId: contact.ball.id,
    kind: "safety",
    score: -distance(cue.position, contact.ball.position),
  };
}

export class SnookerAiPlanner {
  constructor(private readonly random: () => number = Math.random) {}

  thinkDelay(difficulty: AiDifficulty): number {
    const [min, max] = AI_DIFFICULTY[difficulty].thinkDelayMs;
    return Math.round(min + (max - min) * this.random());
  }

  chooseNomination(balls: readonly BallState[], radius: number, halfX: number, halfZ: number, difficulty: AiDifficulty): ColorId {
    const ranked = COLOR_IDS.flatMap((color) => buildPotCandidates({ balls, target: color, radius, halfX, halfZ, difficulty }, color)
      .slice(0, 1)
      .map((plan) => ({ color, score: plan.score })))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.color ?? [...COLOR_IDS]
      .reverse()
      .find((color) => balls.some((ball) => ball.id === color && !ball.pocketed)) ?? "black";
  }

  plan(input: AiPlannerInput): AiShotPlan | undefined {
    const profile = AI_DIFFICULTY[input.difficulty];
    const candidates = buildPotCandidates(input);
    const poolSize = Math.min(candidates.length, profile.candidatePool);
    const base = candidates.length
      ? candidates[poolSize === 1 ? 0 : Math.min(poolSize - 1, Math.floor(this.random() * poolSize))]
      : buildSafety(input);
    if (!base) return undefined;
    const angleError = (this.random() * 2 - 1) * profile.maxAngleError;
    const cosine = Math.cos(angleError);
    const sine = Math.sin(angleError);
    const powerError = (this.random() * 2 - 1) * profile.maxPowerError;
    return {
      ...base,
      direction: normalize({
        x: base.direction.x * cosine - base.direction.z * sine,
        z: base.direction.x * sine + base.direction.z * cosine,
      }),
      power: clamp(base.power + powerError, 0.18, 0.92),
    };
  }

  chooseCuePlacement(canPlace: (position: Vec2) => boolean): Vec2 | undefined {
    const candidates: Vec2[] = [
      { x: -1.08, z: -0.12 }, { x: -1.08, z: 0.12 }, { x: -1.12, z: 0 },
      { x: -1.18, z: -0.08 }, { x: -1.18, z: 0.08 }, { x: -0.98, z: -0.2 }, { x: -0.98, z: 0.2 },
    ];
    return candidates.find(canPlace);
  }
}

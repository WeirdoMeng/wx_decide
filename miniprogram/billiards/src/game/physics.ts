export type Vec2 = { x: number; z: number };

export type BallState = {
  id: string;
  kind: "cue" | "red" | "color" | "solid" | "stripe" | "eight";
  label: string;
  color: string;
  position: Vec2;
  velocity: Vec2;
  pocketed: boolean;
  sideSpin: number;
  followSpin: number;
};

export type PhysicsEvent =
  | { type: "impact"; strength: number; balls: readonly [string, string] }
  | { type: "cushion"; strength: number; ball: string }
  | { type: "pocket"; ball: BallState };

export type AimPreview = {
  primary: { start: Vec2; end: Vec2 };
  impact: Vec2;
  target?: { start: Vec2; end: Vec2 };
  cueAfterImpact?: { start: Vec2; end: Vec2 };
};

// Slightly enlarged from regulation scale for a phone-sized viewport. Physics
// and rendering share this value so visible contacts still match collisions.
const BALL_RADIUS = 0.033;
const TABLE_HALF_X = 1.83;
const TABLE_HALF_Z = 0.9295;
const STOP_SPEED = 0.004;
const BAULK_LINE_X = -0.92;
const D_RADIUS = 0.30;
const MAX_TRAVEL_PER_SUBSTEP = BALL_RADIUS * 0.04;

function shotSpeed(power: number): number {
  return 0.42 + Math.pow(Math.max(0, Math.min(1, power)), 1.35) * 3.05;
}
export const SNOOKER_POCKETS: ReadonlyArray<Vec2 & { radius: number }> = [
  { x: -1.82, z: -0.92, radius: 0.082 },
  { x: 0, z: -0.94, radius: 0.071 },
  { x: 1.82, z: -0.92, radius: 0.082 },
  { x: -1.82, z: 0.92, radius: 0.082 },
  { x: 0, z: 0.94, radius: 0.071 },
  { x: 1.82, z: 0.92, radius: 0.082 },
];

const COLOR_SPOTS: Record<string, Vec2> = {
  yellow: { x: -0.92, z: -0.30 },
  green: { x: -0.92, z: 0.30 },
  brown: { x: -0.92, z: 0 },
  blue: { x: 0, z: 0 },
  pink: { x: 0.405, z: 0 },
  black: { x: 1.28, z: 0 },
};

export function isInsideSnookerD(position: Vec2): boolean {
  const dx = position.x - BAULK_LINE_X;
  return position.x <= BAULK_LINE_X && dx * dx + position.z * position.z <= D_RADIUS * D_RADIUS + 1e-9;
}

export class BilliardsPhysics {
  readonly radius = BALL_RADIUS;
  readonly halfX = TABLE_HALF_X;
  readonly halfZ = TABLE_HALF_Z;
  balls: BallState[] = [];
  onEvent?: (event: PhysicsEvent) => void;

  constructor(public mode: "snooker" | "eight" = "snooker") {
    this.reset();
  }

  get cueBall(): BallState {
    return this.balls[0];
  }

  reset(): void {
    const balls: BallState[] = [];
    const add = (id: string, kind: BallState["kind"], label: string, color: string, x: number, z: number): void => {
      balls.push({ id, kind, label, color, position: { x, z }, velocity: { x: 0, z: 0 }, pocketed: false, sideSpin: 0, followSpin: 0 });
    };

    // Start inside the D without overlapping the brown, green or yellow spot.
    add("cue", "cue", "母球", "#f5edd5", -1.12, 0.12);
    if (this.mode === "eight") {
      const order = [1, 9, 2, 10, 8, 3, 4, 11, 5, 12, 13, 6, 14, 15, 7];
      const palette = ["#edbd2b", "#2475b1", "#c52b32", "#754797", "#e27a23", "#287f5a", "#91372e", "#111820"];
      const gap = BALL_RADIUS * 2 + 0.002;
      let index = 0;
      for (let row = 0; row < 5; row += 1) for (let slot = 0; slot <= row; slot += 1) {
        const number = order[index++];
        add(`pool-${number}`, number === 8 ? "eight" : number < 8 ? "solid" : "stripe", `${number}`, palette[(number - 1) % 8], 0.48 + row * gap * 0.88, (slot - row / 2) * gap);
      }
      this.balls = balls;
      return;
    }
    const gap = BALL_RADIUS * 2 + 0.005;
    let redIndex = 1;
    for (let row = 0; row < 5; row += 1) {
      for (let slot = 0; slot <= row; slot += 1) {
        add(`red-${redIndex}`, "red", `红球 ${redIndex}`, "#a51f2f", 0.48 + row * gap * 0.88, (slot - row / 2) * gap,);
        redIndex += 1;
      }
    }
    add("yellow", "color", "黄球", "#e3b52d", -0.92, -0.30);
    add("green", "color", "绿球", "#287b50", -0.92, 0.30);
    add("brown", "color", "棕球", "#704326", -0.92, 0);
    add("blue", "color", "蓝球", "#266d9f", 0, 0);
    add("pink", "color", "粉球", "#df668c", 0.405, 0);
    add("black", "color", "黑球", "#171717", 1.28, 0);
    this.balls = balls;
  }

  isMoving(): boolean {
    return this.balls.some((ball) => !ball.pocketed && Math.hypot(ball.velocity.x, ball.velocity.z) > STOP_SPEED);
  }

  shoot(direction: Vec2, power: number, sideSpin: number, followSpin: number): boolean {
    const cue = this.cueBall;
    if (cue.pocketed || this.isMoving()) return false;
    const length = Math.hypot(direction.x, direction.z);
    if (length < 0.001) return false;
    const nx = direction.x / length;
    const nz = direction.z / length;
    const speed = shotSpeed(power);
    cue.velocity.x = nx * speed + -nz * sideSpin * speed * 0.014;
    cue.velocity.z = nz * speed + nx * sideSpin * speed * 0.014;
    cue.sideSpin = sideSpin;
    cue.followSpin = followSpin;
    return true;
  }

  canPlaceCue(position: Vec2): boolean {
    if (this.mode === "snooker" && !isInsideSnookerD(position)) return false;
    if (Math.abs(position.x) > TABLE_HALF_X - BALL_RADIUS * 1.5 || Math.abs(position.z) > TABLE_HALF_Z - BALL_RADIUS * 1.5) return false;
    return this.balls.every((ball) => ball.id === "cue" || ball.pocketed || Math.hypot(position.x - ball.position.x, position.z - ball.position.z) > BALL_RADIUS * 2.12);
  }

  placeCue(position: Vec2): boolean {
    if (!this.canPlaceCue(position)) return false;
    const cue = this.cueBall;
    cue.position = { ...position };
    cue.velocity = { x: 0, z: 0 };
    cue.pocketed = false;
    cue.sideSpin = 0;
    cue.followSpin = 0;
    return true;
  }

  respotEight(): boolean {
    const ball = this.balls.find((candidate) => candidate.id === "pool-8");
    if (!ball) return false;
    const spot = this.findNearestFreeSpot(ball.id, { x: 0.48, z: 0 });
    const target = this.canPlaceBall(ball.id, { x: 0.48, z: 0 }) ? { x: 0.48, z: 0 } : spot;
    if (!target) return false;
    ball.position = { ...target }; ball.velocity = { x: 0, z: 0 }; ball.pocketed = false;
    return true;
  }

  respotColor(id: string): boolean {
    const ball = this.balls.find((candidate) => candidate.id === id && candidate.kind === "color");
    const ownSpot = COLOR_SPOTS[id];
    if (!ball || !ownSpot) return false;
    const spotOrder = [ownSpot, COLOR_SPOTS.black, COLOR_SPOTS.pink, COLOR_SPOTS.blue, COLOR_SPOTS.brown, COLOR_SPOTS.green, COLOR_SPOTS.yellow];
    const available = spotOrder.find((spot) => this.canPlaceBall(ball.id, spot));
    const fallback = available ?? this.findNearestFreeSpot(ball.id, ownSpot);
    if (!fallback) return false;
    ball.position = { ...fallback };
    ball.velocity = { x: 0, z: 0 };
    ball.pocketed = false;
    ball.sideSpin = 0;
    ball.followSpin = 0;
    return true;
  }

  predictShot(direction: Vec2, sideSpin = 0, power = 0.42, followSpin = 0): AimPreview {
    const cue = this.cueBall;
    const length = Math.hypot(direction.x, direction.z) || 1;
    const aimed = { x: direction.x / length, z: direction.z / length };
    const launch = {
      x: aimed.x - aimed.z * sideSpin * 0.014,
      z: aimed.z + aimed.x * sideSpin * 0.014,
    };
    const launchLength = Math.hypot(launch.x, launch.z) || 1;
    const ray = { x: launch.x / launchLength, z: launch.z / launchLength };
    const boundary = this.traceToBoundary(cue.position, ray, 8);
    let nearestBall: BallState | undefined;
    let nearestDistance = boundary.distance;
    const collisionRadius = BALL_RADIUS * 2;

    for (const ball of this.balls) {
      if (ball.id === cue.id || ball.pocketed) continue;
      const dx = ball.position.x - cue.position.x;
      const dz = ball.position.z - cue.position.z;
      const projection = dx * ray.x + dz * ray.z;
      if (projection <= 0) continue;
      const perpendicularSquared = dx * dx + dz * dz - projection * projection;
      const radiusSquared = collisionRadius * collisionRadius;
      if (perpendicularSquared >= radiusSquared) continue;
      const hitDistance = projection - Math.sqrt(radiusSquared - perpendicularSquared);
      if (hitDistance > 0.001 && hitDistance < nearestDistance) {
        nearestDistance = hitDistance;
        nearestBall = ball;
      }
    }

    const impact = {
      x: cue.position.x + ray.x * nearestDistance,
      z: cue.position.z + ray.z * nearestDistance,
    };
    const preview: AimPreview = {
      primary: { start: { ...cue.position }, end: impact },
      impact,
    };

    if (nearestBall) {
      const nx = (nearestBall.position.x - impact.x) / collisionRadius;
      const nz = (nearestBall.position.z - impact.z) / collisionRadius;
      const normalLength = Math.hypot(nx, nz) || 1;
      const normal = { x: nx / normalLength, z: nz / normalLength };
      const speed = shotSpeed(power);
      const rolling = 0.205 * (1 - Math.max(-0.35, Math.min(0.35, followSpin * 0.18)));
      const impactSpeed = Math.sqrt(Math.max(0.001, speed * speed - 2 * rolling * nearestDistance));
      const travelTime = rolling > 0 ? (speed - impactSpeed) / rolling : nearestDistance / speed;
      const normalAmount = ray.x * normal.x + ray.z * normal.z;
      const impulseSpeed = (1 + 0.965) * normalAmount * impactSpeed * 0.5;
      const remainingSideSpin = sideSpin * Math.pow(0.34, travelTime);
      const tangent = { x: -normal.z, z: normal.x };
      const targetVelocity = {
        x: normal.x * impulseSpeed + tangent.x * remainingSideSpin * 0.009,
        z: normal.z * impulseSpeed + tangent.z * remainingSideSpin * 0.009,
      };
      const targetSpeed = Math.hypot(targetVelocity.x, targetVelocity.z) || 1;
      const targetDirection = { x: targetVelocity.x / targetSpeed, z: targetVelocity.z / targetSpeed };
      const targetEnd = this.extendPath(nearestBall.position, targetDirection, 0.72);
      preview.target = { start: { ...nearestBall.position }, end: targetEnd };

      const cueVelocity = {
        x: ray.x * impactSpeed - normal.x * impulseSpeed,
        z: ray.z * impactSpeed - normal.z * impulseSpeed,
      };
      const cueSpeed = Math.hypot(cueVelocity.x, cueVelocity.z);
      if (cueSpeed > impactSpeed * 0.08) {
        const cueExit = { x: cueVelocity.x / cueSpeed, z: cueVelocity.z / cueSpeed };
        preview.cueAfterImpact = { start: impact, end: this.extendPath(impact, cueExit, 0.56) };
      }
      return preview;
    }

    const reflected = { ...ray };
    if (boundary.axis === "x" || boundary.axis === "corner") reflected.x *= -1;
    if (boundary.axis === "z" || boundary.axis === "corner") reflected.z *= -1;
    preview.cueAfterImpact = { start: impact, end: this.extendPath(impact, reflected, 0.72) };
    return preview;
  }

  step(dt: number): void {
    const fastest = this.balls.reduce((speed, ball) => Math.max(speed, Math.hypot(ball.velocity.x, ball.velocity.z)), 0);
    const substeps = Math.max(1, Math.min(24, Math.ceil(fastest * dt / MAX_TRAVEL_PER_SUBSTEP)));
    const substep = dt / substeps;
    for (let index = 0; index < substeps; index += 1) this.stepSubstep(substep);
  }

  private stepSubstep(dt: number): void {
    for (const ball of this.balls) {
      if (ball.pocketed) continue;
      ball.position.x += ball.velocity.x * dt;
      ball.position.z += ball.velocity.z * dt;
      if (this.tryPocket(ball)) continue;
      this.resolveCushions(ball);

      const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
      if (speed > 0) {
        const rolling = 0.205 * (1 - Math.max(-0.35, Math.min(0.35, ball.followSpin * 0.18)));
        const next = Math.max(0, speed - rolling * dt);
        const scale = next / speed;
        ball.velocity.x *= scale;
        ball.velocity.z *= scale;
        ball.sideSpin *= Math.pow(0.34, dt);
        ball.followSpin *= Math.pow(0.25, dt);
        if (next < STOP_SPEED) ball.velocity = { x: 0, z: 0 };
      }
    }

    for (let i = 0; i < this.balls.length; i += 1) {
      for (let j = i + 1; j < this.balls.length; j += 1) this.resolveBallCollision(this.balls[i], this.balls[j]);
    }
  }

  private tryPocket(ball: BallState): boolean {
    for (const pocket of SNOOKER_POCKETS) {
      if (Math.hypot(ball.position.x - pocket.x, ball.position.z - pocket.z) < pocket.radius) {
        ball.pocketed = true;
        ball.velocity = { x: 0, z: 0 };
        this.onEvent?.({ type: "pocket", ball });
        return true;
      }
    }
    return false;
  }

  private resolveCushions(ball: BallState): void {
    const maxX = TABLE_HALF_X - BALL_RADIUS;
    const maxZ = TABLE_HALF_Z - BALL_RADIUS;
    let impact = 0;
    if (Math.abs(ball.position.x) > maxX) {
      impact = Math.max(impact, Math.abs(ball.velocity.x));
      ball.position.x = Math.sign(ball.position.x) * maxX;
      ball.velocity.x *= -0.89;
      ball.velocity.z += ball.sideSpin * 0.045 * Math.sign(ball.position.x);
      ball.sideSpin *= 0.72;
    }
    if (Math.abs(ball.position.z) > maxZ) {
      impact = Math.max(impact, Math.abs(ball.velocity.z));
      ball.position.z = Math.sign(ball.position.z) * maxZ;
      ball.velocity.z *= -0.89;
      ball.velocity.x -= ball.sideSpin * 0.045 * Math.sign(ball.position.z);
      ball.sideSpin *= 0.72;
    }
    if (impact > 0.08) this.onEvent?.({ type: "cushion", strength: Math.min(1, impact / 2.2), ball: ball.id });
  }

  private resolveBallCollision(a: BallState, b: BallState): void {
    if (a.pocketed || b.pocketed) return;
    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const distance = Math.hypot(dx, dz);
    const diameter = BALL_RADIUS * 2;
    if (distance <= 0 || distance >= diameter) return;
    const nx = dx / distance;
    const nz = dz / distance;
    const overlap = diameter - distance;
    a.position.x -= nx * overlap * 0.5;
    a.position.z -= nz * overlap * 0.5;
    b.position.x += nx * overlap * 0.5;
    b.position.z += nz * overlap * 0.5;
    const relative = (b.velocity.x - a.velocity.x) * nx + (b.velocity.z - a.velocity.z) * nz;
    if (relative >= 0) return;
    const impulse = -(1 + 0.965) * relative * 0.5;
    a.velocity.x -= impulse * nx;
    a.velocity.z -= impulse * nz;
    b.velocity.x += impulse * nx;
    b.velocity.z += impulse * nz;
    const tangentX = -nz;
    const tangentZ = nx;
    const spinTransfer = a.sideSpin * 0.009;
    b.velocity.x += tangentX * spinTransfer;
    b.velocity.z += tangentZ * spinTransfer;
    a.sideSpin *= 0.58;
    this.onEvent?.({ type: "impact", strength: Math.min(1, Math.abs(relative) / 2.4), balls: [a.id, b.id] });
  }

  private canPlaceBall(id: string, position: Vec2): boolean {
    if (Math.abs(position.x) > TABLE_HALF_X - BALL_RADIUS * 1.5 || Math.abs(position.z) > TABLE_HALF_Z - BALL_RADIUS * 1.5) return false;
    return this.balls.every((ball) => ball.id === id || ball.pocketed || Math.hypot(position.x - ball.position.x, position.z - ball.position.z) > BALL_RADIUS * 2.12);
  }

  private findNearestFreeSpot(id: string, origin: Vec2): Vec2 | undefined {
    for (let step = 1; step <= 36; step += 1) {
      for (const direction of [1, -1]) {
        const candidate = { x: origin.x + direction * step * BALL_RADIUS * 1.1, z: origin.z };
        if (this.canPlaceBall(id, candidate)) return candidate;
      }
    }
    return undefined;
  }

  private extendPath(start: Vec2, direction: Vec2, maxDistance: number): Vec2 {
    const trace = this.traceToBoundary(start, direction, maxDistance);
    const distance = Math.max(0, trace.distance - 0.006);
    return { x: start.x + direction.x * distance, z: start.z + direction.z * distance };
  }

  private traceToBoundary(start: Vec2, direction: Vec2, maxDistance: number): { distance: number; axis: "x" | "z" | "corner" } {
    const maxX = TABLE_HALF_X - BALL_RADIUS;
    const maxZ = TABLE_HALF_Z - BALL_RADIUS;
    const tx = Math.abs(direction.x) < 0.0001
      ? Number.POSITIVE_INFINITY
      : ((direction.x > 0 ? maxX : -maxX) - start.x) / direction.x;
    const tz = Math.abs(direction.z) < 0.0001
      ? Number.POSITIVE_INFINITY
      : ((direction.z > 0 ? maxZ : -maxZ) - start.z) / direction.z;
    const boundaryDistance = Math.max(0, Math.min(tx, tz));
    if (maxDistance < boundaryDistance) return { distance: maxDistance, axis: tx < tz ? "x" : "z" };
    const axis = Math.abs(tx - tz) < 0.002 ? "corner" : tx < tz ? "x" : "z";
    return { distance: boundaryDistance, axis };
  }
}

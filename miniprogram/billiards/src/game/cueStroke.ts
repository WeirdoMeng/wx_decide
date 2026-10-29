export type CueStrokePhase = "idle" | "pullback" | "hold" | "forward";

export type CueStrokeSnapshot = {
  phase: CueStrokePhase;
  offset: number;
  pullback: number;
};

export type CueStrokeRequest = {
  power: number;
  commit: () => void;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOutCubic = (value: number): number => 1 - Math.pow(1 - value, 3);
const easeInCubic = (value: number): number => value * value * value;

export function pullbackForPower(power: number): number {
  return 0.075 + clamp01(power) * 0.245;
}

/**
 * A render-loop driven cue stroke. It owns no timers, so callers can cancel it
 * synchronously on pause, restart, rotation or app backgrounding.
 */
export class CueStrokeAnimation {
  private phaseValue: CueStrokePhase = "idle";
  private phaseStartedAt = 0;
  private power = 0;
  private pullback = 0;
  private offsetValue = 0;
  private commit?: () => void;
  private committed = false;

  get phase(): CueStrokePhase {
    return this.phaseValue;
  }

  get isActive(): boolean {
    return this.phaseValue !== "idle";
  }

  get offset(): number {
    return this.offsetValue;
  }

  start(request: CueStrokeRequest, now: number): boolean {
    if (this.isActive) return false;
    this.power = clamp01(request.power);
    this.pullback = pullbackForPower(this.power);
    this.offsetValue = 0;
    this.phaseValue = "pullback";
    this.phaseStartedAt = now;
    this.commit = request.commit;
    this.committed = false;
    return true;
  }

  update(now: number): CueStrokeSnapshot {
    if (!this.isActive) return this.snapshot();
    const elapsed = Math.max(0, now - this.phaseStartedAt);
    if (this.phaseValue === "pullback") {
      const duration = 180 + this.power * 150;
      this.offsetValue = this.pullback * easeOutCubic(Math.min(1, elapsed / duration));
      if (elapsed >= duration) this.enter("hold", now);
    } else if (this.phaseValue === "hold") {
      this.offsetValue = this.pullback;
      if (elapsed >= 72) this.enter("forward", now);
    } else if (this.phaseValue === "forward") {
      const duration = 105 + (1 - this.power) * 45;
      this.offsetValue = this.pullback * (1 - easeInCubic(Math.min(1, elapsed / duration)));
      if (elapsed >= duration) {
        this.offsetValue = 0;
        this.phaseValue = "idle";
        const commit = this.commit;
        this.commit = undefined;
        if (!this.committed) {
          this.committed = true;
          commit?.();
        }
      }
    }
    return this.snapshot();
  }

  cancel(): boolean {
    const wasActive = this.isActive;
    this.phaseValue = "idle";
    this.offsetValue = 0;
    this.commit = undefined;
    this.committed = false;
    return wasActive;
  }

  private enter(phase: CueStrokePhase, now: number): void {
    this.phaseValue = phase;
    this.phaseStartedAt = now;
  }

  private snapshot(): CueStrokeSnapshot {
    return { phase: this.phaseValue, offset: this.offsetValue, pullback: this.pullback };
  }
}

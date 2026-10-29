import type { Vec2 } from "./physics";

export type RearAimDrag = {
  cueStartAngle: number;
  rearStartAngle: number;
};

export const REAR_AIM_SENSITIVITY = 0.38;

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function beginRearAimDrag(cue: Vec2, direction: Vec2, point: Vec2, minimumRearDistance = 0.08): RearAimDrag | undefined {
  const rearX = point.x - cue.x;
  const rearZ = point.z - cue.z;
  const rearDistance = Math.hypot(rearX, rearZ);
  const behindDistance = -(rearX * direction.x + rearZ * direction.z);
  if (rearDistance < minimumRearDistance || behindDistance < minimumRearDistance) return undefined;
  return {
    cueStartAngle: Math.atan2(direction.z, direction.x),
    rearStartAngle: Math.atan2(rearZ, rearX),
  };
}

export function updateRearAimDirection(drag: RearAimDrag, cue: Vec2, point: Vec2, sensitivity = REAR_AIM_SENSITIVITY): Vec2 {
  const rearAngle = Math.atan2(point.z - cue.z, point.x - cue.x);
  const dragAngle = normalizeAngle(rearAngle - drag.rearStartAngle);
  const cueAngle = drag.cueStartAngle + dragAngle * sensitivity;
  return { x: Math.cos(cueAngle), z: Math.sin(cueAngle) };
}

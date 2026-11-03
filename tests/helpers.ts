import { expect } from 'vitest';
import { Vector3, type ICurve } from '../src/index.js';

export const v = (x: number, y: number, z = 0) => new Vector3(x, y, z);

export function expectPoint(actual: Vector3, expected: Vector3, tolerance = 1e-9): void {
  const distance = actual.distanceTo(expected);
  if (!(distance <= tolerance)) {
    expect.fail(`(${actual.toArray()}) is ${distance} from (${expected.toArray()}), tolerance ${tolerance}`);
  }
}

/** Evenly spaced parameters, strictly inside the domain unless `ends` is set. */
export function parameters(curve: ICurve, count: number, ends = false): number[] {
  const { start, end } = curve.domain;
  return Array.from({ length: count }, (_, i) =>
    ends ? start + ((end - start) * i) / (count - 1) : start + ((end - start) * (i + 0.5)) / count,
  );
}

/** Brute-force polyline length, for checking the integrators independently. */
export function bruteLength(curve: ICurve, segments = 20000): number {
  const { start, end } = curve.domain;
  let total = 0;
  let previous = curve.pointAt(start);
  for (let i = 1; i <= segments; i++) {
    const p = curve.pointAt(start + ((end - start) * i) / segments);
    total += p.distanceTo(previous);
    previous = p;
  }
  return total;
}

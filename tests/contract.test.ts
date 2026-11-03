import { describe, expect, it } from 'vitest';
import { Transform3, Vector3, curveFromJSON, type CurveJSON, type ICurve } from '../src/index.js';
import { catalog, notSerializable } from './catalog.js';
import { bruteLength, expectPoint, parameters, v } from './helpers.js';

/** Central difference with a span-aware step, independent of the code under test. */
function numericDerivative(curve: ICurve, t: number, order: 1 | 2 | 3): Vector3 {
  const span = curve.domain.end - curve.domain.start;
  const h = span * (order === 1 ? 1e-5 : order === 2 ? 1e-4 : 1e-3);
  const p = (x: number) => curve.pointAt(x);
  if (order === 1) {
    return p(t + h).sub(p(t - h)).scale(1 / (2 * h));
  }
  if (order === 2) {
    return p(t + h).add(p(t - h)).sub(p(t).scale(2)).scale(1 / (h * h));
  }
  return p(t + 2 * h).sub(p(t - 2 * h)).sub(p(t + h).sub(p(t - h)).scale(2)).scale(1 / (2 * h * h * h));
}

/** Parameters at least `margin` of a span away from any joint, for tests of smooth behaviour. */
function smoothParameters(curve: ICurve, count: number): number[] {
  const breaks = curve.breakpoints();
  const margin = (curve.domain.end - curve.domain.start) * 2e-3;
  return parameters(curve, count).filter((t) => breaks.every((b) => Math.abs(b - t) > margin));
}

describe.each(Object.entries(catalog))('%s', (name, make) => {
  const curve = make();
  const size = Math.max(curve.boundingBox().diagonal, 1);

  it('has a valid domain and consistent end points', () => {
    expect(curve.domain.end).toBeGreaterThan(curve.domain.start);
    expectPoint(curve.startPoint, curve.pointAt(curve.domain.start));
    expectPoint(curve.endPoint, curve.pointAt(curve.domain.end));
    expect(curve.isClosed).toBe(curve.startPoint.distanceTo(curve.endPoint) <= 1e-7);
  });

  it('has derivatives matching finite differences', () => {
    for (const t of smoothParameters(curve, 9)) {
      const d1 = curve.derivativeAt(t, 1);
      const tolerance1 = 1e-5 * Math.max(d1.length, 1);
      expectPoint(d1, numericDerivative(curve, t, 1), tolerance1);
      const d2 = curve.derivativeAt(t, 2);
      expectPoint(d2, numericDerivative(curve, t, 2), 2e-3 * Math.max(d2.length, 1));
      const d3 = curve.derivativeAt(t, 3);
      expectPoint(d3, numericDerivative(curve, t, 3), 2e-2 * Math.max(d3.length, 1));
    }
  });

  it('has an orthonormal frame', () => {
    for (const t of smoothParameters(curve, 7)) {
      const f = curve.frameAt(t);
      expect(f.tangent.length).toBeCloseTo(1, 9);
      expect(f.normal.length).toBeCloseTo(1, 9);
      expect(f.binormal.length).toBeCloseTo(1, 9);
      expect(f.tangent.dot(f.normal)).toBeCloseTo(0, 6);
      expect(f.tangent.dot(f.binormal)).toBeCloseTo(0, 6);
      expect(f.normal.dot(f.binormal)).toBeCloseTo(0, 6);
    }
  });

  it('has a tangent along the first derivative, and non-negative curvature', () => {
    for (const t of smoothParameters(curve, 7)) {
      const d = curve.derivativeAt(t);
      expect(curve.tangentAt(t).dot(d)).toBeCloseTo(d.length, 6);
      expect(curve.curvatureAt(t)).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(curve.torsionAt(t))).toBe(true);
    }
  });

  it('measures the same length as a dense polyline', () => {
    expect(Math.abs(curve.length - bruteLength(curve))).toBeLessThan(1e-3 * Math.max(curve.length, 1));
  });

  it('adds lengths across a split parameter', () => {
    const { start, end } = curve.domain;
    const t = start + (end - start) * 0.37;
    expect(curve.lengthBetween(start, t) + curve.lengthBetween(t, end)).toBeCloseTo(curve.length, 7);
    expect(curve.lengthBetween(t, start)).toBeCloseTo(curve.lengthBetween(start, t), 9);
  });

  it('inverts arc length', () => {
    for (const fraction of [0, 0.13, 0.5, 0.81, 1]) {
      const s = curve.length * fraction;
      const t = curve.parameterAtLength(s);
      expect(curve.lengthBetween(curve.domain.start, t)).toBeCloseTo(s, 6);
    }
  });

  it('divides into pieces of equal length', () => {
    const params = curve.divideByCount(5);
    expect(params).toHaveLength(6);
    for (let i = 0; i < 5; i++) {
      expect(curve.lengthBetween(params[i]!, params[i + 1]!)).toBeCloseTo(curve.length / 5, 6);
    }
    expect(curve.divideByLength(curve.length / 4)).toHaveLength(5);
  });

  it('tessellates within the chord tolerance', () => {
    const tolerance = size * 2e-3;
    const { points, parameters: params } = curve.tessellate({ chordTolerance: tolerance });
    expect(points.length).toBe(params.length);
    expectPoint(points[0]!, curve.startPoint);
    expectPoint(points[points.length - 1]!, curve.endPoint);
    for (let i = 0; i + 1 < params.length; i++) {
      expect(params[i + 1]!).toBeGreaterThan(params[i]!);
      const a = points[i]!;
      const chord = points[i + 1]!.sub(a);
      for (const f of [0.25, 0.5, 0.75]) {
        const p = curve.pointAt(params[i]! + (params[i + 1]! - params[i]!) * f);
        const along = Math.min(Math.max(p.sub(a).dot(chord) / chord.lengthSquared, 0), 1);
        expect(p.distanceTo(a.addScaled(chord, along))).toBeLessThanOrEqual(tolerance * 1.5);
      }
    }
  });

  it('respects a maximum segment length', () => {
    const maxSegmentLength = curve.length / 3;
    if (curve.type === 'Line' || curve.type === 'Polyline') {
      return; // These return their exact vertices.
    }
    const { points } = curve.tessellate({ chordTolerance: size, maxSegmentLength });
    for (let i = 0; i + 1 < points.length; i++) {
      expect(points[i]!.distanceTo(points[i + 1]!)).toBeLessThanOrEqual(maxSegmentLength * 1.0001);
    }
  });

  it('has a tight bounding box', () => {
    const box = curve.boundingBox();
    const dense = parameters(curve, 3000, true).map((t) => curve.pointAt(t));
    let [minX, minY, minZ] = [Infinity, Infinity, Infinity];
    let [maxX, maxY, maxZ] = [-Infinity, -Infinity, -Infinity];
    for (const p of dense) {
      expect(box.contains(p, 1e-9 * size)).toBe(true);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      maxZ = Math.max(maxZ, p.z);
    }
    const slack = 1e-3 * size;
    expect(box.min.distanceTo(v(minX, minY, minZ))).toBeLessThan(slack);
    expect(box.max.distanceTo(v(maxX, maxY, maxZ))).toBeLessThan(slack);
  });

  it('finds the closest point as well as a brute-force search', () => {
    const center = curve.boundingBox().center;
    const queries = [center, center.add(v(size, 0.3 * size, -0.2 * size)), curve.pointAt(curve.domain.start).add(v(0.1, 0.2, 0.3))];
    const dense = parameters(curve, 4000, true).map((t) => curve.pointAt(t));
    for (const q of queries) {
      const result = curve.closestPoint(q);
      const brute = Math.min(...dense.map((p) => p.distanceTo(q)));
      expect(result.distance).toBeLessThanOrEqual(brute + 1e-7);
      expectPoint(result.point, curve.pointAt(result.parameter), 1e-9);
      expect(curve.distanceTo(q)).toBeCloseTo(result.distance, 12);
    }
  });

  it('finds a point on itself at distance zero', () => {
    for (const t of parameters(curve, 5)) {
      expect(curve.distanceTo(curve.pointAt(t))).toBeLessThan(1e-6);
    }
  });

  it('trims to the requested piece', () => {
    const { start, end } = curve.domain;
    const a = start + (end - start) * 0.2;
    const b = start + (end - start) * 0.7;
    const piece = curve.trim(a, b);
    expectPoint(piece.startPoint, curve.pointAt(a), 1e-7);
    expectPoint(piece.endPoint, curve.pointAt(b), 1e-7);
    expect(piece.length).toBeCloseTo(curve.lengthBetween(a, b), 6);
    expect(() => curve.trim(a, a)).toThrow(RangeError);
  });

  it('splits into pieces that meet and keep the length', () => {
    const { start, end } = curve.domain;
    const t = start + (end - start) * 0.4;
    const [left, right] = curve.split(t);
    expectPoint(left.startPoint, curve.startPoint, 1e-7);
    expectPoint(left.endPoint, right.startPoint, 1e-7);
    expectPoint(right.endPoint, curve.endPoint, 1e-7);
    expect(left.length + right.length).toBeCloseTo(curve.length, 6);
    expect(() => curve.split(start)).toThrow(RangeError);
  });

  it('reverses', () => {
    const back = curve.reversed();
    expectPoint(back.startPoint, curve.endPoint, 1e-7);
    expectPoint(back.endPoint, curve.startPoint, 1e-7);
    expect(back.length).toBeCloseTo(curve.length, 6);
    expect(back.reversed().equals(curve, 1e-6)).toBe(true);
    // The tangent flips, and points are visited in the opposite order.
    const middle = back.domain.start + (back.domain.end - back.domain.start) * 0.43;
    const onOriginal = curve.closestPoint(back.pointAt(middle));
    expect(onOriginal.distance).toBeLessThan(1e-6);
    expect(back.tangentAt(middle).dot(curve.tangentAt(onOriginal.parameter))).toBeLessThan(-0.99);
  });

  it('follows a rigid transform and keeps its length', () => {
    const t = Transform3.translate(v(5, -2, 1)).compose(Transform3.rotate(v(1, 2, 3), 0.8));
    const moved = curve.transformed(t);
    expect(moved.length).toBeCloseTo(curve.length, 6);
    for (const f of [0, 0.3, 0.77, 1]) {
      const a = curve.domain.start + (curve.domain.end - curve.domain.start) * f;
      const b = moved.domain.start + (moved.domain.end - moved.domain.start) * f;
      expectPoint(moved.pointAt(b), t.applyToPoint(curve.pointAt(a)), 1e-7);
    }
  });

  it('follows uniform scale and mirror transforms', () => {
    const scaled = curve.transformed(Transform3.scale(2.5));
    expect(scaled.length).toBeCloseTo(curve.length * 2.5, 5);
    expect(scaled.distanceTo(curve.pointAt(curve.domain.start).scale(2.5))).toBeLessThan(1e-6);
    const mirror = Transform3.mirror(v(1, 0, 1), v(1, 1, 1));
    const reflected = curve.transformed(mirror);
    expect(reflected.length).toBeCloseTo(curve.length, 5);
    for (const f of [0, 0.3, 0.77, 1]) {
      const a = curve.domain.start + (curve.domain.end - curve.domain.start) * f;
      const b = reflected.domain.start + (reflected.domain.end - reflected.domain.start) * f;
      expectPoint(reflected.pointAt(b), mirror.applyToPoint(curve.pointAt(a)), 1e-7);
    }
  });

  it('follows a non-uniform scale', () => {
    const t = Transform3.scale(2, 0.5, 3);
    const stretched = curve.transformed(t);
    for (const f of [0, 0.3, 0.77, 1]) {
      const a = curve.domain.start + (curve.domain.end - curve.domain.start) * f;
      const b = stretched.domain.start + (stretched.domain.end - stretched.domain.start) * f;
      expectPoint(stretched.pointAt(b), t.applyToPoint(curve.pointAt(a)), 1e-7);
    }
  });

  it('converts to NURBS within tolerance', () => {
    const tolerance = 1e-3 * size;
    const nurbs = curve.toNurbs(tolerance);
    expectPoint(nurbs.startPoint, curve.startPoint, 1e-7);
    expectPoint(nurbs.endPoint, curve.endPoint, 1e-7);
    // Some exact forms use another parameterization, so measure geometric distance both ways.
    for (const t of parameters(curve, 25, true)) {
      expect(nurbs.distanceTo(curve.pointAt(t))).toBeLessThanOrEqual(tolerance * 1.5);
    }
    for (const t of parameters(nurbs, 25, true)) {
      expect(curve.distanceTo(nurbs.pointAt(t))).toBeLessThanOrEqual(tolerance * 1.5);
    }
  });

  it('round-trips through JSON, or refuses clearly', () => {
    if (notSerializable.has(name)) {
      expect(() => curve.toJSON()).toThrow(TypeError);
      return;
    }
    const text = JSON.stringify(curve.toJSON());
    const restored = curveFromJSON(JSON.parse(text) as CurveJSON);
    expect(restored.domain).toEqual(curve.domain);
    expect(restored.equals(curve, 1e-9)).toBe(true);
  });

  it('clamps or wraps parameters outside the domain', () => {
    const { start, end } = curve.domain;
    const span = end - start;
    if (curve.isPeriodic) {
      expectPoint(curve.pointAt(start + span * 0.25 + span), curve.pointAt(start + span * 0.25), 1e-9);
      expectPoint(curve.pointAt(start + span * 0.25 - span), curve.pointAt(start + span * 0.25), 1e-9);
    } else {
      expectPoint(curve.pointAt(end + span), curve.endPoint);
      expectPoint(curve.pointAt(start - span), curve.startPoint);
    }
    expect(() => curve.pointAt(Number.NaN)).toThrow(RangeError);
    expect(() => curve.derivativeAt(start, 0)).toThrow(RangeError);
  });

  it('samples evenly in the parameter', () => {
    const points = curve.sample(5);
    expect(points).toHaveLength(5);
    expectPoint(points[2]!, curve.pointAt((curve.domain.start + curve.domain.end) / 2));
    expect(() => curve.sample(1)).toThrow(RangeError);
  });
});

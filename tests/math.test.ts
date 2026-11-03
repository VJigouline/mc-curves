import { describe, expect, it } from 'vitest';
import { BoundingBox3, Frame3, Transform3, Vector3 } from '../src/index.js';
import { bisect, binomial, finiteDifferenceWeights, goldenMinimum, integrate, solveVectorSystem } from '../src/math/numeric.js';
import { expectPoint, v } from './helpers.js';

describe('Vector3', () => {
  it('does basic algebra', () => {
    expectPoint(v(1, 2, 3).add(v(4, 5, 6)), v(5, 7, 9));
    expectPoint(v(1, 0).cross(v(0, 1)), Vector3.Z);
    expect(v(1, 2, 3).dot(v(4, 5, 6))).toBe(32);
    expect(v(3, 4).length).toBe(5);
    expectPoint(Vector3.fromArray([1, 2]), v(1, 2, 0));
  });

  it('keeps the zero vector when normalizing', () => {
    expect(Vector3.ZERO.normalized()).toBe(Vector3.ZERO);
  });

  it('finds a perpendicular for any direction', () => {
    for (const d of [Vector3.X, Vector3.Y, Vector3.Z, v(1, 2, 3), v(-1, 0, 0.001)]) {
      const p = d.anyPerpendicular();
      expect(p.dot(d)).toBeCloseTo(0, 12);
      expect(p.length).toBeCloseTo(1, 12);
    }
  });
});

describe('Transform3', () => {
  it('rotates by the right-hand rule', () => {
    expectPoint(Transform3.rotate(Vector3.Z, Math.PI / 2).applyToPoint(Vector3.X), Vector3.Y, 1e-12);
  });

  it('rotates and scales about an origin', () => {
    expectPoint(Transform3.rotate(Vector3.Z, Math.PI, v(1, 1)).applyToPoint(v(2, 1)), v(0, 1), 1e-12);
    expectPoint(Transform3.scale(2, 2, 2, v(1, 1)).applyToPoint(v(2, 1)), v(3, 1), 1e-12);
  });

  it('mirrors in a plane', () => {
    expectPoint(Transform3.mirror(Vector3.X, v(1, 0)).applyToPoint(v(3, 5)), v(-1, 5), 1e-12);
  });

  it('composes with the argument applied first', () => {
    const t = Transform3.translate(v(1, 0)).compose(Transform3.scale(2));
    expectPoint(t.applyToPoint(v(1, 1)), v(3, 2), 1e-12);
  });

  it('does not translate vectors', () => {
    expectPoint(Transform3.translate(v(1, 1)).applyToVector(Vector3.X), Vector3.X);
  });

  it('recognizes similarities', () => {
    expect(Transform3.scale(3).similarityScale()).toBeCloseTo(3, 12);
    expect(Transform3.rotate(v(1, 2, 3), 1).compose(Transform3.scale(2)).similarityScale()).toBeCloseTo(2, 10);
    expect(Transform3.mirror(v(1, 1, 0)).similarityScale()).toBeCloseTo(1, 12);
    expect(Transform3.scale(1, 2, 1).similarityScale()).toBeUndefined();
    expect(Transform3.scale(0).similarityScale()).toBeUndefined();
    expect(new Transform3([1, 1, 0, 0, 1, 0, 0, 0, 1], Vector3.ZERO).similarityScale()).toBeUndefined();
  });

  it('rejects bad input', () => {
    expect(() => new Transform3([1, 2], Vector3.ZERO)).toThrow(RangeError);
    expect(() => Transform3.rotate(Vector3.ZERO, 1)).toThrow(RangeError);
    expect(() => Transform3.mirror(Vector3.ZERO)).toThrow(RangeError);
  });
});

describe('Frame3', () => {
  it('builds a right-handed orthonormal frame', () => {
    const f = Frame3.fromNormal(v(1, 2, 3), v(1, 1, 1), v(1, 0, 0));
    expect(f.xAxis.dot(f.yAxis)).toBeCloseTo(0, 12);
    expect(f.xAxis.dot(f.zAxis)).toBeCloseTo(0, 12);
    expectPoint(f.xAxis.cross(f.yAxis), f.zAxis, 1e-12);
    expect(f.xAxis.dot(v(1, 0, 0))).toBeGreaterThan(0);
  });

  it('uses world X for a plain Z normal', () => {
    expectPoint(Frame3.fromNormal(Vector3.ZERO).xAxis, Vector3.X);
  });

  it('converts both ways', () => {
    const f = Frame3.fromNormal(v(1, 2, 3), v(0, 1, 1));
    const p = v(4, 5, 6);
    expectPoint(f.toWorld(f.toLocal(p)), p, 1e-12);
  });

  it('rejects bad input', () => {
    expect(() => Frame3.fromNormal(Vector3.ZERO, Vector3.ZERO)).toThrow(RangeError);
    expect(() => Frame3.fromNormal(Vector3.ZERO, Vector3.Z, Vector3.Z)).toThrow(RangeError);
  });

  it('keeps world points under a mirror, though the frame turns left-handed', () => {
    const f = Frame3.fromNormal(v(1, 0));
    const m = Transform3.mirror(Vector3.X);
    const mirrored = f.transformed(m);
    const local = v(2, 3, 4);
    expectPoint(mirrored.toWorld(local), m.applyToPoint(f.toWorld(local)), 1e-12);
    expect(mirrored.planeNormal.dot(mirrored.zAxis)).toBeCloseTo(-1, 12);
  });
});

describe('BoundingBox3', () => {
  const box = BoundingBox3.fromPoints([v(0, 0, 0), v(2, 4, 6)]);

  it('measures and tests containment', () => {
    expectPoint(box.center, v(1, 2, 3));
    expect(box.diagonal).toBeCloseTo(Math.sqrt(56), 12);
    expect(box.contains(v(1, 1, 1))).toBe(true);
    expect(box.contains(v(3, 1, 1))).toBe(false);
    expect(box.contains(v(2.5, 1, 1), 1)).toBe(true);
  });

  it('tests overlap', () => {
    expect(box.intersects(BoundingBox3.fromPoints([v(1, 1, 1), v(9, 9, 9)]))).toBe(true);
    expect(box.intersects(BoundingBox3.fromPoints([v(3, 0, 0), v(4, 1, 1)]))).toBe(false);
    expect(box.intersects(BoundingBox3.fromPoints([v(3, 0, 0), v(4, 1, 1)]), 1)).toBe(true);
  });

  it('needs a point', () => {
    expect(() => BoundingBox3.fromPoints([])).toThrow(RangeError);
  });
});

describe('numeric', () => {
  it('integrates smooth and peaked functions', () => {
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 12);
    expect(integrate((x) => 1 / (1e-4 + x * x), -1, 1)).toBeCloseTo(2 * 100 * Math.atan(100), 7);
  });

  it('finds roots and minima', () => {
    expect(bisect((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 12);
    expect(bisect((x) => x, 0, 2)).toBe(0);
    expect(goldenMinimum((x) => (x - 1) ** 2, -5, 5)).toBeCloseTo(1, 6);
  });

  it('computes binomials', () => {
    expect(binomial(5, 2)).toBe(10);
    expect(binomial(10, 0)).toBe(1);
    expect(binomial(30, 15)).toBe(155117520);
  });

  it('computes finite-difference weights', () => {
    const weights = finiteDifferenceWeights(0, [-1, 0, 1], 2);
    expect(weights[0]).toBeCloseTo(1, 12);
    expect(weights[1]).toBeCloseTo(-2, 12);
    expect(weights[2]).toBeCloseTo(1, 12);
    // One-sided: first derivative of x^2 at 0 from nodes 0, 1, 2.
    const oneSided = finiteDifferenceWeights(0, [0, 1, 2], 1);
    expect(0 * oneSided[0]! + 1 * oneSided[1]! + 4 * oneSided[2]!).toBeCloseTo(0, 12);
  });

  it('solves a linear system that needs pivoting, and rejects a singular one', () => {
    const x = solveVectorSystem([[0, 1], [2, 0]], [v(1, 2), v(4, 6)]);
    expectPoint(x[0]!, v(2, 3));
    expectPoint(x[1]!, v(1, 2));
    expect(() => solveVectorSystem([[1, 1], [1, 1]], [v(1, 0), v(2, 0)])).toThrow(RangeError);
  });
});

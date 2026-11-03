import { describe, expect, it } from 'vitest';
import { BezierCurve, BSplineCurve, CircularArc, EllipticalArc, Line, Polyline, Vector3 } from '../src/index.js';
import { expectPoint, v } from './helpers.js';

describe('intersect', () => {
  it('finds a line crossing a circle twice', () => {
    const hits = new Line(v(-2, 0), v(2, 0)).intersect(CircularArc.circle(v(0, 0), 1));
    expect(hits).toHaveLength(2);
    expectPoint(hits[0]!.point, v(-1, 0), 1e-7);
    expectPoint(hits[1]!.point, v(1, 0), 1e-7);
    expect(hits[0]!.parameterA).toBeCloseTo(0.25, 7);
    expect(hits[0]!.distance).toBeLessThanOrEqual(1e-6);
  });

  it('reports matching parameters on both curves', () => {
    const a = new BezierCurve([v(0, 0), v(1, 3), v(3, -3), v(4, 0)]);
    const b = new Line(v(-1, 0.2), v(5, 0.2));
    const hits = a.intersect(b);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expectPoint(a.pointAt(h.parameterA), b.pointAt(h.parameterB), 1e-6);
    }
  });

  it('finds all four crossings of two ellipses', () => {
    const a = EllipticalArc.ellipse(v(0, 0), 3, 1);
    const b = EllipticalArc.ellipse(v(0, 0), 1, 3);
    const hits = a.intersect(b);
    expect(hits).toHaveLength(4);
    const expected = Math.sqrt(9 / 10);
    for (const h of hits) {
      expect(Math.abs(h.point.x)).toBeCloseTo(expected, 6);
      expect(Math.abs(h.point.y)).toBeCloseTo(expected, 6);
    }
  });

  it('counts a tangent touch once', () => {
    const hits = new Line(v(-2, 1), v(2, 1)).intersect(CircularArc.circle(v(0, 0), 1));
    expect(hits).toHaveLength(1);
    expectPoint(hits[0]!.point, v(0, 1), 1e-3);
  });

  it('counts a crossing at the seam of a closed curve once', () => {
    const hits = new Line(v(0, 0), v(2, 0)).intersect(CircularArc.circle(v(0, 0), 1));
    expect(hits).toHaveLength(1);
    expectPoint(hits[0]!.point, v(1, 0), 1e-7);
  });

  it('finds crossings between polylines and splines', () => {
    const zig = new Polyline([v(0, -1), v(1, 1), v(2, -1), v(3, 1)]);
    const spline = BSplineCurve.interpolate([v(-1, 0), v(0.5, 0), v(1.5, 0), v(2.5, 0), v(4, 0)]);
    expect(zig.intersect(spline)).toHaveLength(3);
  });

  it('finds a shared end point', () => {
    const hits = new Line(v(0, 0), v(1, 0)).intersect(new Line(v(1, 0), v(1, 1)));
    expect(hits).toHaveLength(1);
    expectPoint(hits[0]!.point, v(1, 0));
  });

  it('returns nothing for separate curves', () => {
    expect(new Line(v(0, 0), v(1, 0)).intersect(new Line(v(0, 1), v(1, 1)))).toEqual([]);
    expect(CircularArc.circle(v(0, 0), 1).intersect(CircularArc.circle(v(5, 0), 1))).toEqual([]);
    // Skew lines in 3D pass near each other without meeting.
    expect(new Line(v(-1, 0, 0), v(1, 0, 0)).intersect(new Line(v(0, -1, 0.001), v(0, 1, 0.001)))).toEqual([]);
  });

  it('returns finite results for overlapping curves', () => {
    const hits = new Line(v(0, 0), v(2, 0)).intersect(new Line(v(1, 0), v(3, 0)));
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.distance).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('intersectPlane', () => {
  it('finds a circle crossing a plane twice', () => {
    const hits = CircularArc.circle(v(0, 0), 2).intersectPlane(v(1, 0), Vector3.X);
    expect(hits).toHaveLength(2);
    for (const h of hits) {
      expect(h.point.x).toBeCloseTo(1, 9);
      expect(h.point.length).toBeCloseTo(2, 9);
    }
  });

  it('finds an end point on the plane once', () => {
    const hits = new Line(v(0, 0), v(1, 0)).intersectPlane(v(1, 0), Vector3.X);
    expect(hits).toHaveLength(1);
    expectPoint(hits[0]!.point, v(1, 0));
  });

  it('returns nothing when there is no crossing, and rejects a zero normal', () => {
    const line = new Line(v(0, 0), v(1, 0));
    expect(line.intersectPlane(v(5, 0), Vector3.X)).toEqual([]);
    expect(() => line.intersectPlane(v(0, 0), Vector3.ZERO)).toThrow(RangeError);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ArchimedeanSpiral,
  BezierCurve,
  BSplineCurve,
  CatmullRomSpline,
  CircularArc,
  Clothoid,
  CompositeCurve,
  CubicSpline,
  EllipticalArc,
  Epitrochoid,
  Frame3,
  Helix,
  HermiteSpline,
  HyperbolicArc,
  Hypotrochoid,
  InvoluteCurve,
  Line,
  LogarithmicSpiral,
  NurbsCurve,
  OffsetCurve,
  ParabolicArc,
  ParametricCurve,
  Polyline,
  Transform3,
  TransformedCurve,
  Trochoid,
  Vector3,
  curveFromJSON,
} from '../src/index.js';
import { expectPoint, parameters, v } from './helpers.js';

const W = Frame3.WORLD;

describe('Line', () => {
  const line = new Line(v(0, 0), v(3, 4));

  it('has closed-form properties', () => {
    expect(line.length).toBe(5);
    expect(line.degree).toBe(1);
    expect(line.curvatureAt(0.5)).toBe(0);
    expect(line.radiusOfCurvatureAt(0.5)).toBe(Infinity);
    expectPoint(line.pointAtLength(2.5), v(1.5, 2));
  });

  it('projects points and clamps at its ends', () => {
    expect(line.closestPoint(v(0, 5)).parameter).toBeCloseTo(0.8, 12);
    expect(line.closestPoint(v(-5, -5)).parameter).toBe(0);
    expect(line.closestPoint(v(50, 50)).parameter).toBe(1);
  });

  it('counts as planar but has no unique plane', () => {
    expect(line.isPlanar()).toBe(true);
    expect(line.planeNormal()).toBeUndefined();
    expect(line.enclosedArea()).toBeUndefined();
  });

  it('needs an explicit normal to offset', () => {
    expect(() => line.offset(1)).toThrow(RangeError);
    const shifted = new Line(v(0, 0), v(1, 0)).offset(2, Vector3.Z);
    // X cross Z is -Y.
    expectPoint(shifted.startPoint, v(0, -2));
  });

  it('rejects a zero-length segment', () => {
    expect(() => new Line(v(1, 1), v(1, 1))).toThrow(RangeError);
  });
});

describe('Polyline', () => {
  const square = new Polyline([v(0, 0), v(2, 0), v(2, 2), v(0, 2)], { closed: true });

  it('uses the vertex index as parameter', () => {
    expect(square.domain).toEqual({ start: 0, end: 4 });
    expectPoint(square.pointAt(1.5), v(2, 1));
    expect(square.isClosed).toBe(true);
    expect(square.length).toBeCloseTo(8, 12);
    expect(square.enclosedArea()).toBeCloseTo(4, 9);
  });

  it('uses the right-hand derivative at a corner', () => {
    expectPoint(square.derivativeAt(1), v(0, 2));
    expectPoint(square.derivativeAt(4), v(0, -2));
  });

  it('offsets with mitred corners', () => {
    // With normal +Z, tangent x normal points out of a counter-clockwise loop.
    const outer = square.offset(1, Vector3.Z);
    expectPoint(outer.pointAt(0), v(-1, -1));
    expectPoint(outer.pointAt(1), v(3, -1));
    expectPoint(outer.pointAt(2), v(3, 3));
    expect(outer.enclosedArea()).toBeCloseTo(16, 9);
  });

  it('rejects repeated vertices and short lists', () => {
    expect(() => new Polyline([v(0, 0)])).toThrow(RangeError);
    expect(() => new Polyline([v(0, 0), v(1, 0), v(1, 0)])).toThrow(RangeError);
  });
});

describe('CircularArc', () => {
  const circle = CircularArc.circle(v(1, 1, 1), 2, Vector3.Z);

  it('is periodic with the textbook measures', () => {
    expect(circle.type).toBe('Circle');
    expect(circle.isClosed).toBe(true);
    expect(circle.isPeriodic).toBe(true);
    expect(circle.length).toBeCloseTo(4 * Math.PI, 12);
    expect(circle.enclosedArea()).toBeCloseTo(4 * Math.PI, 12);
    expect(circle.curvatureAt(1)).toBeCloseTo(0.5, 12);
    expect(circle.torsionAt(1)).toBe(0);
    expect(circle.isPlanar()).toBe(true);
  });

  it('has a normal pointing at the centre', () => {
    for (const t of [0.1, 1, 4]) {
      expectPoint(circle.normalAt(t), circle.center.sub(circle.pointAt(t)).normalized(), 1e-12);
    }
  });

  it('matches the numeric enclosed area of the base class', () => {
    const ellipseLike = new ParametricCurve((t) => v(2 * Math.cos(t), 2 * Math.sin(t)), 0, 2 * Math.PI);
    expect(ellipseLike.enclosedArea()).toBeCloseTo(4 * Math.PI, 9);
  });

  it('passes through three points', () => {
    const arc = CircularArc.fromThreePoints(v(1, 0), v(0, 1), v(-1, 0));
    expect(arc.radius).toBeCloseTo(1, 12);
    expect(arc.sweep).toBeCloseTo(Math.PI, 12);
    expectPoint(arc.startPoint, v(1, 0), 1e-12);
    expectPoint(arc.pointAt(arc.domain.start + arc.sweep / 2), v(0, 1), 1e-12);
    expectPoint(arc.endPoint, v(-1, 0), 1e-12);
    expect(() => CircularArc.fromThreePoints(v(0, 0), v(1, 1), v(2, 2))).toThrow(RangeError);
  });

  it('passes through three points in 3D', () => {
    const a = v(1, 0, 2);
    const b = v(0, 3, 1);
    const c = v(-2, 1, 4);
    const arc = CircularArc.fromThreePoints(a, b, c);
    expect(arc.distanceTo(b)).toBeLessThan(1e-10);
    expectPoint(arc.startPoint, a, 1e-10);
    expectPoint(arc.endPoint, c, 1e-10);
  });

  it('stays a circle under a similarity, and becomes a general curve otherwise', () => {
    const scaled = circle.transformed(Transform3.scale(3));
    expect(scaled).toBeInstanceOf(CircularArc);
    expect((scaled as CircularArc).radius).toBeCloseTo(6, 12);
    expect(circle.transformed(Transform3.scale(3, 1, 1))).toBeInstanceOf(TransformedCurve);
  });

  it('gives an exact offset, and rejects a collapse', () => {
    const grown = circle.offset(1) as CircularArc;
    expect(grown).toBeInstanceOf(CircularArc);
    expect(grown.radius).toBe(3);
    const flipped = circle.offset(1, Vector3.Z.negate()) as CircularArc;
    expect(flipped.radius).toBe(1);
    expect(() => circle.offset(-3)).toThrow(RangeError);
  });

  it('offsets correctly after a mirror', () => {
    const mirrored = circle.transformed(Transform3.mirror(Vector3.X)) as CircularArc;
    expect(mirrored.offset(1).length).toBeCloseTo(6 * Math.PI, 9);
    // The generic offset uses the same convention, so both agree.
    const generic = new OffsetCurve(mirrored, 1, mirrored.planeNormal()!);
    expect(generic.length).toBeCloseTo(6 * Math.PI, 5);
  });

  it('has an exact NURBS form', () => {
    const nurbs = circle.toNurbs();
    expect(nurbs.isRational).toBe(true);
    expect(nurbs.degree).toBe(2);
    for (const t of parameters(nurbs, 101, true)) {
      expect(nurbs.pointAt(t).distanceTo(circle.center)).toBeCloseTo(2, 12);
    }
    expect(nurbs.length).toBeCloseTo(4 * Math.PI, 8);
  });

  it('rejects bad input', () => {
    expect(() => CircularArc.circle(v(0, 0), 0)).toThrow(RangeError);
    expect(() => new CircularArc(W, 1, 0, 7)).toThrow(RangeError);
    expect(() => new CircularArc(W, 1, 2, 1)).toThrow(RangeError);
  });
});

describe('EllipticalArc', () => {
  const ellipse = EllipticalArc.ellipse(v(0, 0), 5, 3);

  it('has the Ramanujan perimeter and exact area', () => {
    const [a, b] = [5, 3];
    const h = ((a - b) / (a + b)) ** 2;
    const ramanujan = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    expect(ellipse.length).toBeCloseTo(ramanujan, 4);
    expect(ellipse.enclosedArea()).toBeCloseTo(15 * Math.PI, 12);
    expect(ellipse.type).toBe('Ellipse');
  });

  it('has the known curvature at its vertices', () => {
    expect(ellipse.curvatureAt(0)).toBeCloseTo(5 / 9, 10);
    expect(ellipse.curvatureAt(Math.PI / 2)).toBeCloseTo(3 / 25, 10);
  });

  it('has an exact NURBS form', () => {
    const nurbs = ellipse.toNurbs();
    for (const t of parameters(nurbs, 101, true)) {
      const p = nurbs.pointAt(t);
      expect((p.x / 5) ** 2 + (p.y / 3) ** 2).toBeCloseTo(1, 12);
    }
  });
});

describe('ParabolicArc', () => {
  const parabola = new ParabolicArc(W, 2, -3, 3);

  it('lies on y^2 = 4 f x', () => {
    for (const t of parameters(parabola, 11, true)) {
      const p = parabola.pointAt(t);
      expect(p.y * p.y).toBeCloseTo(8 * p.x, 12);
    }
  });

  it('has curvature 1 / (2 f) at the vertex', () => {
    expect(parabola.curvatureAt(0)).toBeCloseTo(0.25, 12);
  });

  it('converts to NURBS with the same parameterization', () => {
    const nurbs = parabola.toNurbs();
    expect(nurbs.isRational).toBe(false);
    for (const t of parameters(parabola, 11, true)) {
      expectPoint(nurbs.pointAt(t), parabola.pointAt(t), 1e-12);
    }
  });

  it('scales its domain with a similarity', () => {
    const big = parabola.transformed(Transform3.scale(2)) as ParabolicArc;
    expect(big.domain).toEqual({ start: -6, end: 6 });
    expectPoint(big.endPoint, parabola.endPoint.scale(2), 1e-12);
  });
});

describe('HyperbolicArc', () => {
  const hyperbola = new HyperbolicArc(W, 3, 2, -1, 1.5);

  it('lies on x^2/a^2 - y^2/b^2 = 1, also in NURBS form', () => {
    const check = (p: Vector3) => expect((p.x / 3) ** 2 - (p.y / 2) ** 2).toBeCloseTo(1, 10);
    parameters(hyperbola, 11, true).forEach((t) => check(hyperbola.pointAt(t)));
    const nurbs = hyperbola.toNurbs();
    parameters(nurbs, 51, true).forEach((t) => check(nurbs.pointAt(t)));
  });
});

describe('BezierCurve', () => {
  const quadratic = new BezierCurve([v(0, 0), v(1, 2), v(2, 0)]);

  it('evaluates from the Bernstein form', () => {
    const points = [v(0, 0), v(1, 3), v(4, 3), v(5, 0)];
    const cubic = new BezierCurve(points);
    for (const t of [0, 0.2, 0.5, 0.9, 1]) {
      let sum = Vector3.ZERO;
      points.forEach((p, i) => {
        sum = sum.addScaled(p, BezierCurve.bernstein(3, i, t));
      });
      expectPoint(cubic.pointAt(t), sum, 1e-12);
    }
  });

  it('has derivatives that vanish past the degree', () => {
    expectPoint(quadratic.derivativeAt(0.3, 3), Vector3.ZERO);
    expectPoint(quadratic.derivativeAt(0, 1), v(2, 4), 1e-12);
    expectPoint(quadratic.derivativeAt(0.5, 2), v(0, -8), 1e-12);
  });

  it('splits exactly', () => {
    const [left, right] = quadratic.split(0.3) as [BezierCurve, BezierCurve];
    expect(left).toBeInstanceOf(BezierCurve);
    for (const f of [0, 0.25, 0.5, 1]) {
      expectPoint(left.pointAt(f), quadratic.pointAt(0.3 * f), 1e-12);
      expectPoint(right.pointAt(f), quadratic.pointAt(0.3 + 0.7 * f), 1e-12);
    }
  });

  it('keeps its shape when the degree is elevated', () => {
    const higher = quadratic.elevated();
    expect(higher.degree).toBe(3);
    for (const t of [0, 0.3, 0.7, 1]) {
      expectPoint(higher.pointAt(t), quadratic.pointAt(t), 1e-12);
    }
  });

  it('represents a quarter circle in rational form', () => {
    const quarter = new BezierCurve([v(1, 0), v(1, 1), v(0, 1)], [1, Math.SQRT1_2, 1]);
    expect(quarter.type).toBe('RationalBezierCurve');
    for (const t of parameters(quarter, 21, true)) {
      expect(quarter.pointAt(t).length).toBeCloseTo(1, 12);
    }
    const [left, right] = quarter.split(0.4);
    expect(left.pointAt(0.5).length).toBeCloseTo(1, 12);
    expect(right.pointAt(0.5).length).toBeCloseTo(1, 12);
    expect(quarter.elevated().pointAt(0.3).length).toBeCloseTo(1, 12);
    expect(quarter.curvatureAt(0.3)).toBeCloseTo(1, 10);
  });

  it('rejects bad input', () => {
    expect(() => new BezierCurve([v(0, 0)])).toThrow(RangeError);
    expect(() => new BezierCurve([v(0, 0), v(1, 1)], [1])).toThrow(RangeError);
    expect(() => new BezierCurve([v(0, 0), v(1, 1)], [1, 0])).toThrow(RangeError);
  });
});

describe('NurbsCurve', () => {
  const spline = new NurbsCurve(
    3,
    [v(0, 0), v(1, 2), v(3, 3, 1), v(5, 1), v(6, -1), v(8, 0)],
    [0, 0, 0, 0, 1, 2, 4, 4, 4, 4],
    [1, 2, 1, 0.5, 1, 1],
  );

  it('matches a Bezier curve on a single span', () => {
    const points = [v(0, 0), v(1, 3), v(4, 3), v(5, 0)];
    const nurbs = new BSplineCurve(3, points, [0, 0, 0, 0, 1, 1, 1, 1]);
    const bezier = new BezierCurve(points);
    for (const t of [0, 0.2, 0.5, 1]) {
      expectPoint(nurbs.pointAt(t), bezier.pointAt(t), 1e-12);
      expectPoint(nurbs.derivativeAt(t), bezier.derivativeAt(t), 1e-11);
      expectPoint(nurbs.derivativeAt(t, 2), bezier.derivativeAt(t, 2), 1e-10);
    }
    expect(nurbs.type).toBe('BSplineCurve');
  });

  it('keeps its shape through knot insertion', () => {
    for (const [u, times] of [[0.5, 1], [1, 2], [3, 3]] as const) {
      const refined = spline.insertKnot(u, times);
      expect(refined.controlPoints.length).toBe(spline.controlPoints.length + times);
      for (const t of parameters(spline, 40, true)) {
        expectPoint(refined.pointAt(t), spline.pointAt(t), 1e-10);
      }
    }
  });

  it('rejects knot insertion past the multiplicity limit or outside the domain', () => {
    expect(() => spline.insertKnot(1, 4)).toThrow(RangeError);
    expect(() => spline.insertKnot(9)).toThrow(RangeError);
  });

  it('trims exactly to a clamped piece over the same parameters', () => {
    const piece = spline.trim(0.7, 3.1);
    expect(piece).toBeInstanceOf(NurbsCurve);
    expect(piece.domain).toEqual({ start: 0.7, end: 3.1 });
    for (const t of parameters(piece, 30, true)) {
      expectPoint(piece.pointAt(t), spline.pointAt(t), 1e-10);
    }
  });

  it('handles an unclamped knot vector', () => {
    const unclamped = new BSplineCurve(2, [v(0, 0), v(1, 2), v(3, 2), v(4, 0), v(5, 1)], [0, 1, 2, 3, 4, 5, 6, 7]);
    expect(unclamped.domain).toEqual({ start: 2, end: 5 });
    const piece = unclamped.trim(2.5, 4.5);
    for (const t of parameters(piece, 20, true)) {
      expectPoint(piece.pointAt(t), unclamped.pointAt(t), 1e-10);
    }
    const whole = unclamped.trim(2, 5);
    for (const t of parameters(unclamped, 20, true)) {
      expectPoint(whole.pointAt(t), unclamped.pointAt(t), 1e-10);
    }
  });

  it('splits into Bezier segments', () => {
    const segments = spline.toBezierSegments();
    expect(segments).toHaveLength(3);
    for (const s of segments) {
      expect(s.controlPoints).toHaveLength(4);
      for (const t of parameters(s, 7, true)) {
        expectPoint(s.pointAt(t), spline.pointAt(t), 1e-10);
      }
    }
  });

  it('reverses over the same domain with a mirrored parameter', () => {
    const back = spline.reversed();
    expect(back.domain).toEqual(spline.domain);
    for (const t of parameters(spline, 13, true)) {
      expectPoint(back.pointAt(4 - t), spline.pointAt(t), 1e-10);
    }
  });

  it('is exact under any affine transform', () => {
    const t = new Transform3([1, 2, 0, 0, 1, 3, 1, 0, 1], v(1, 1, 1));
    const sheared = spline.transformed(t);
    for (const u of parameters(spline, 13, true)) {
      expectPoint(sheared.pointAt(u), t.applyToPoint(spline.pointAt(u)), 1e-9);
    }
  });

  it('drops equal weights to the plain form', () => {
    const c = new NurbsCurve(1, [v(0, 0), v(1, 0)], [0, 0, 1, 1], [2, 2]);
    expect(c.isRational).toBe(false);
  });

  it('rejects bad input', () => {
    const p = [v(0, 0), v(1, 1), v(2, 0)];
    expect(() => new NurbsCurve(0, p, [0, 1, 2, 3])).toThrow(RangeError);
    expect(() => new NurbsCurve(3, p, [0, 0, 0, 0, 1, 1, 1])).toThrow(RangeError);
    expect(() => new NurbsCurve(2, p, [0, 0, 0, 1, 1])).toThrow(RangeError);
    expect(() => new NurbsCurve(2, p, [0, 0, 1, 0, 1, 1])).toThrow(RangeError);
    expect(() => new NurbsCurve(2, p, [0, 0, 0, 1, 1, 1], [1, -1, 1])).toThrow(RangeError);
    expect(() => new NurbsCurve(2, p, [1, 1, 1, 1, 1, 1])).toThrow(RangeError);
  });
});

describe('BSplineCurve', () => {
  it('builds clamped uniform knots', () => {
    const c = BSplineCurve.uniform(2, [v(0, 0), v(1, 1), v(2, 0), v(3, 1)]);
    expect(c.knots).toEqual([0, 0, 0, 0.5, 1, 1, 1]);
    expectPoint(c.startPoint, v(0, 0));
    expectPoint(c.endPoint, v(3, 1));
    expect(() => BSplineCurve.uniform(3, [v(0, 0), v(1, 1)])).toThrow(RangeError);
  });

  it('interpolates its points', () => {
    const points = [v(0, 0), v(1, 2, 1), v(3, 3), v(4, 1, -1), v(6, 0), v(8, 2)];
    const c = BSplineCurve.interpolate(points, 3);
    for (const p of points) {
      expect(c.distanceTo(p)).toBeLessThan(1e-9);
    }
    expect(() => BSplineCurve.interpolate([v(0, 0), v(1, 1)], 3)).toThrow(RangeError);
    expect(() => BSplineCurve.interpolate([v(0, 0), v(0, 0), v(1, 1), v(2, 2)], 3)).toThrow(RangeError);
  });
});

describe('Hermite family', () => {
  const points = [v(0, 0), v(2, 3), v(5, 1), v(7, 4), v(9, 0)];

  it('HermiteSpline meets its points and tangents', () => {
    const s = new HermiteSpline([v(0, 0), v(1, 1)], [v(1, 0), v(0, 1)], [2, 4]);
    expectPoint(s.pointAt(2), v(0, 0));
    expectPoint(s.pointAt(4), v(1, 1));
    expectPoint(s.derivativeAt(2), v(1, 0), 1e-12);
    expectPoint(s.derivativeAt(4), v(0, 1), 1e-12);
  });

  it('HermiteSpline has an exact NURBS form over the same parameters', () => {
    const s = new HermiteSpline(points, points.map((p) => p.scale(0.1)));
    const nurbs = s.toNurbs();
    for (const t of parameters(s, 40, true)) {
      expectPoint(nurbs.pointAt(t), s.pointAt(t), 1e-11);
    }
  });

  it.each([0, 0.5, 1])('CatmullRomSpline (alpha %d) interpolates and is C1', (alpha) => {
    const s = new CatmullRomSpline(points, { alpha });
    for (const [i, p] of points.entries()) {
      expectPoint(s.pointAt(s.knots[i]!), p, 1e-12);
    }
    for (let i = 1; i + 1 < s.knots.length; i++) {
      const k = s.knots[i]!;
      expectPoint(s.derivativeAt(k - 1e-7), s.derivativeAt(k), 1e-4);
    }
  });

  it('closed CatmullRomSpline is C1 at the seam', () => {
    const s = new CatmullRomSpline(points.slice(0, 4), { closed: true });
    expect(s.isClosed).toBe(true);
    expectPoint(s.derivativeAt(s.domain.start), s.derivativeAt(s.domain.end), 1e-12);
  });

  it('CubicSpline is C2 with natural ends', () => {
    const s = new CubicSpline(points);
    for (let i = 1; i + 1 < s.knots.length; i++) {
      const k = s.knots[i]!;
      expectPoint(s.derivativeAt(k - 1e-7), s.derivativeAt(k), 1e-5);
      expectPoint(s.derivativeAt(k - 1e-7, 2), s.derivativeAt(k, 2), 1e-4);
    }
    expectPoint(s.derivativeAt(s.domain.start, 2), Vector3.ZERO, 1e-9);
    expectPoint(s.derivativeAt(s.domain.end, 2), Vector3.ZERO, 1e-9);
  });

  it('CubicSpline honours clamped end tangents', () => {
    const s = new CubicSpline(points, { startTangent: v(1, 0), endTangent: v(0, -1) });
    expectPoint(s.derivativeAt(s.domain.start), v(1, 0), 1e-10);
    expectPoint(s.derivativeAt(s.domain.end), v(0, -1), 1e-10);
  });

  it('closed CubicSpline is C2 at the seam', () => {
    const s = new CubicSpline(points.slice(0, 4), { closed: true });
    expectPoint(s.derivativeAt(s.domain.start), s.derivativeAt(s.domain.end), 1e-9);
    const second = s.derivativeAt(s.domain.end - 1e-7, 2);
    expectPoint(s.derivativeAt(s.domain.start, 2), second, 1e-4);
  });

  it('rejects bad input', () => {
    expect(() => new HermiteSpline([v(0, 0)], [v(1, 0)])).toThrow(RangeError);
    expect(() => new HermiteSpline([v(0, 0), v(1, 0)], [v(1, 0)])).toThrow(RangeError);
    expect(() => new HermiteSpline([v(0, 0), v(1, 0)], [v(1, 0), v(1, 0)], [1, 1])).toThrow(RangeError);
    expect(() => new CatmullRomSpline([v(0, 0), v(0, 0)])).toThrow(RangeError);
    expect(() => new CubicSpline([v(0, 0), v(0, 0)])).toThrow(RangeError);
  });
});

describe('Helix', () => {
  const radius = 2;
  const pitch = 3;
  const helix = new Helix(W, radius, pitch, 2);
  const c = pitch / (2 * Math.PI);

  it('has the closed-form length, curvature and torsion', () => {
    const k = radius * radius + c * c;
    expect(helix.length).toBeCloseTo(4 * Math.PI * Math.sqrt(k), 10);
    expect(helix.curvatureAt(1)).toBeCloseTo(radius / k, 10);
    expect(helix.torsionAt(1)).toBeCloseTo(c / k, 10);
  });

  it('rises one pitch per turn', () => {
    expect(helix.pointAt(2 * Math.PI).z).toBeCloseTo(pitch, 12);
    expect(helix.endPoint.z).toBeCloseTo(2 * pitch, 12);
  });

  it('flips torsion when left-handed', () => {
    const left = new Helix(W, radius, pitch, 2, { leftHanded: true });
    expect(left.torsionAt(1)).toBeCloseTo(-c / (radius * radius + c * c), 10);
  });

  it('is not planar unless the pitch is zero', () => {
    expect(helix.isPlanar()).toBe(false);
    expect(helix.planeNormal()).toBeUndefined();
    expect(new Helix(W, 1, 0, 1).isPlanar()).toBe(true);
  });

  it('flips torsion under a mirror, as handedness requires', () => {
    const mirrored = helix.transformed(Transform3.mirror(Vector3.X));
    expect(mirrored.torsionAt(1)).toBeCloseTo(-helix.torsionAt(1), 9);
  });

  it('grows with a taper, and rejects a negative radius', () => {
    const cone = new Helix(W, 1, 1, 2, { taper: 1 });
    expect(Math.hypot(cone.endPoint.x, cone.endPoint.y)).toBeCloseTo(3, 10);
    expect(() => new Helix(W, 1, 1, 3, { taper: -1 })).toThrow(RangeError);
    expect(() => new Helix(W, 0, 1, 3)).toThrow(RangeError);
  });

  it('needs an explicit normal to offset', () => {
    expect(() => helix.offset(1)).toThrow(RangeError);
    expect(helix.offset(1, Vector3.Z)).toBeInstanceOf(OffsetCurve);
  });
});

describe('Spirals', () => {
  it('ArchimedeanSpiral grows linearly', () => {
    const s = new ArchimedeanSpiral(W, 1, 0.5, 0, 10);
    for (const t of [0, 2, 5, 10]) {
      expect(s.pointAt(t).length).toBeCloseTo(1 + 0.5 * t, 12);
    }
    expect(() => new ArchimedeanSpiral(W, 1, 0, 0, 10)).toThrow(RangeError);
  });

  it('LogarithmicSpiral has a constant tangent-radius angle', () => {
    const b = 0.2;
    const s = new LogarithmicSpiral(W, 1, b, 0, 8);
    const expected = Math.atan2(1, b);
    for (const t of [0.5, 3, 7]) {
      const radial = s.pointAt(t).normalized();
      expect(Math.acos(radial.dot(s.tangentAt(t)))).toBeCloseTo(expected, 10);
    }
  });

  it('LogarithmicSpiral closed-form length matches the base integrator', () => {
    const s = new LogarithmicSpiral(W, 1, -0.2, 0, 8);
    const numeric = new ParametricCurve((t) => s.pointAt(t), 0, 8, { derivative: (t, o) => s.derivativeAt(t, o) });
    expect(s.length).toBeCloseTo(numeric.length, 8);
  });

  it('InvoluteCurve keeps a tangent string on the base circle', () => {
    const r = 2;
    const s = new InvoluteCurve(W, r, 0, 5);
    expectPoint(s.startPoint, v(r, 0), 1e-12);
    expect(s.length).toBeCloseTo((r * 25) / 2, 10);
    // The string from the tangency point has length r t, and is normal to the involute.
    for (const t of [0.5, 2, 4]) {
      const contact = v(r * Math.cos(t), r * Math.sin(t));
      const string = s.pointAt(t).sub(contact);
      expect(string.length).toBeCloseTo(r * t, 10);
      expect(string.dot(s.derivativeAt(t))).toBeCloseTo(0, 9);
    }
  });

  it('InvoluteCurve measures across its cusp', () => {
    const s = new InvoluteCurve(W, 1, -2, 2);
    expect(s.length).toBeCloseTo(4, 10);
    expect(s.curvatureAt(0)).toBe(Infinity);
    // C' vanishes at the cusp, and C'' = (r, 0) gives the direction.
    expectPoint(s.tangentAt(0), v(1, 0), 1e-9);
  });
});

describe('Clothoid', () => {
  it('has curvature linear in arc length', () => {
    const c = Clothoid.fromCurvatures(W, 0.1, 0.9, 8);
    expect(c.length).toBe(8);
    for (const s of [0, 2, 5, 8]) {
      expect(c.curvatureAt(s)).toBeCloseTo(0.1 + 0.1 * s, 12);
    }
    const numeric = new ParametricCurve((s) => c.pointAt(s), 0, 8, { derivative: (s, o) => c.derivativeAt(s, o) });
    expect(numeric.curvatureAt(5)).toBeCloseTo(0.6, 10);
  });

  it('matches the Fresnel integrals at their limit', () => {
    // With k(s) = pi s, the coordinates are C(s) and S(s), which tend to 1/2.
    // At s = 100 the asymptotic expansion gives C = 1/2 and S = 1/2 - 1 / (100 pi).
    const c = new Clothoid(W, 0, Math.PI, 0, 100);
    expectPoint(c.endPoint, v(0.5, 0.5 - 1 / (100 * Math.PI)), 1e-6);
    // S(1) and C(1) from standard tables.
    const atOne = c.pointAt(1);
    expect(atOne.x).toBeCloseTo(0.7798934, 6);
    expect(atOne.y).toBeCloseTo(0.4382591, 6);
  });

  it('reduces to a line and a circle', () => {
    const line = new Clothoid(W, 0, 0, 0, 5, Math.PI / 2);
    expectPoint(line.endPoint, v(0, 5), 1e-12);
    const circle = new Clothoid(W, 0.5, 0, 0, Math.PI * 2);
    expectPoint(circle.endPoint, v(0, 4), 1e-10);
  });

  it('keeps its shape under a similarity', () => {
    const c = Clothoid.fromCurvatures(W, 0.1, 0.9, 8);
    const big = c.transformed(Transform3.scale(2)) as Clothoid;
    expect(big).toBeInstanceOf(Clothoid);
    expect(big.length).toBeCloseTo(16, 12);
    expect(big.curvatureAt(10)).toBeCloseTo(c.curvatureAt(5) / 2, 12);
    expectPoint(big.endPoint, c.endPoint.scale(2), 1e-10);
  });

  it('supports three derivatives', () => {
    const c = Clothoid.fromCurvatures(W, 0.1, 0.9, 8);
    expect(() => c.derivativeAt(1, 4)).toThrow(RangeError);
  });
});

describe('Roulettes', () => {
  it('a cycloid has arch length 8 r and area 3 pi r^2', () => {
    const r = 1.5;
    const c = Trochoid.cycloid(W, r);
    expect(c.length).toBeCloseTo(8 * r, 8);
    const under = new CompositeCurve([c, new Line(c.endPoint, c.startPoint)]);
    expect(under.enclosedArea()).toBeCloseTo(3 * Math.PI * r * r, 7);
  });

  it('a cycloid has a cusp where it touches the line', () => {
    const c = Trochoid.cycloid(W, 1, 2);
    expect(c.curvatureAt(2 * Math.PI)).toBe(Infinity);
    expectPoint(c.tangentAt(2 * Math.PI), v(0, 1), 1e-9);
  });

  it('a cardioid is an epicycloid with perimeter 16 r and area 6 pi r^2', () => {
    const r = 1;
    const c = new Epitrochoid(W, r, r, r);
    expect(c.isClosed).toBe(true);
    expect(c.length).toBeCloseTo(16 * r, 7);
    expect(c.enclosedArea()).toBeCloseTo(6 * Math.PI, 6);
  });

  it('an astroid is a hypocycloid with perimeter 6 a and area 3 pi a^2 / 8', () => {
    const a = 4;
    const c = new Hypotrochoid(W, a, a / 4, a / 4);
    expect(c.isClosed).toBe(true);
    expect(c.length).toBeCloseTo(6 * a, 6);
    expect(c.enclosedArea()).toBeCloseTo((3 * Math.PI * a * a) / 8, 6);
    for (const t of parameters(c, 21, true)) {
      const p = c.pointAt(t);
      expect(Math.abs(p.x) ** (2 / 3) + Math.abs(p.y) ** (2 / 3)).toBeCloseTo(a ** (2 / 3), 8);
    }
  });

  it('rejects bad input', () => {
    expect(() => new Trochoid(W, 0, 1, 0, 1)).toThrow(RangeError);
    expect(() => new Hypotrochoid(W, 1, 1, 1)).toThrow(RangeError);
    expect(() => new Epitrochoid(W, 1, -1, 1)).toThrow(RangeError);
  });
});

describe('CompositeCurve', () => {
  const stadium = new CompositeCurve([
    new Line(v(0, 0), v(4, 0)),
    new CircularArc(Frame3.fromNormal(v(4, 1)), 1, -Math.PI / 2, Math.PI / 2),
    new Line(v(4, 2), v(0, 2)),
    new CircularArc(Frame3.fromNormal(v(0, 1)), 1, Math.PI / 2, (3 * Math.PI) / 2),
  ]);

  it('adds the measures of its pieces', () => {
    expect(stadium.isClosed).toBe(true);
    expect(stadium.length).toBeCloseTo(8 + 2 * Math.PI, 9);
    expect(stadium.enclosedArea()).toBeCloseTo(8 + Math.PI, 8);
  });

  it('maps parameters to pieces at the same speed', () => {
    expectPoint(stadium.pointAt(0.5), v(2, 0));
    expectPoint(stadium.derivativeAt(0.5), v(4, 0));
    expectPoint(stadium.pointAt(1 + Math.PI / 2), v(5, 1), 1e-12);
  });

  it('reports joints as breakpoints', () => {
    const breaks = stadium.breakpoints();
    expect(breaks).toHaveLength(5);
    expect(breaks[1]).toBe(1);
    expect(breaks[2]).toBeCloseTo(1 + Math.PI, 12);
  });

  it('rejects a gap', () => {
    expect(() => new CompositeCurve([new Line(v(0, 0), v(1, 0)), new Line(v(2, 0), v(3, 0))])).toThrow(RangeError);
    expect(() => new CompositeCurve([])).toThrow(RangeError);
  });

  it('orders and flips unordered pieces', () => {
    const chain = CompositeCurve.connect([
      new Line(v(1, 0), v(2, 0)),
      new Line(v(3, 0), v(2, 0)),
      new Line(v(0, 0), v(1, 0)),
    ]);
    expectPoint(chain.startPoint, v(0, 0));
    expectPoint(chain.endPoint, v(3, 0));
    expect(() => CompositeCurve.connect([new Line(v(0, 0), v(1, 0)), new Line(v(5, 0), v(6, 0))])).toThrow(RangeError);
  });

  it('trims across joints with real pieces', () => {
    const piece = stadium.trim(0.5, 1 + Math.PI / 2) as CompositeCurve;
    expect(piece.curves).toHaveLength(2);
    expect(piece.length).toBeCloseTo(2 + Math.PI / 2, 9);
    expectPoint(piece.endPoint, v(5, 1), 1e-12);
  });
});

describe('Wrappers', () => {
  const base = new ParametricCurve((t) => v(t, t * t), 0, 2);

  it('ReversedCurve mirrors derivatives by order', () => {
    const back = base.reversed();
    expectPoint(back.derivativeAt(0.5), base.derivativeAt(1.5).negate(), 1e-6);
    expectPoint(back.derivativeAt(0.5, 2), base.derivativeAt(1.5, 2), 1e-4);
    expect(back.reversed()).toBe(base);
  });

  it('TrimmedCurve keeps the parameter and flattens nesting', () => {
    const piece = base.trim(0.5, 1.5).trim(0.75, 1);
    expect(piece.domain).toEqual({ start: 0.75, end: 1 });
    expectPoint(piece.pointAt(0.9), base.pointAt(0.9));
  });

  it('TransformedCurve composes in application order', () => {
    const a = Transform3.translate(v(1, 0));
    const b = Transform3.scale(2, 3, 1);
    const twice = base.transformed(a).transformed(b);
    expectPoint(twice.pointAt(1), b.applyToPoint(a.applyToPoint(base.pointAt(1))), 1e-12);
    expect((twice as TransformedCurve).curve).toBe(base);
  });

  it('OffsetCurve stays at the requested distance', () => {
    const offset = base.offset(0.1, Vector3.Z);
    for (const t of parameters(base, 20)) {
      expect(base.distanceTo(offset.pointAt(t))).toBeCloseTo(0.1, 5);
    }
  });

  it('a stretched circle equals an ellipse', () => {
    const stretched = CircularArc.circle(v(0, 0), 1).transformed(Transform3.scale(5, 3, 1));
    const ellipse = EllipticalArc.ellipse(v(0, 0), 5, 3);
    expect(stretched.length).toBeCloseTo(ellipse.length, 7);
    expect(stretched.equals(ellipse, 1e-9)).toBe(true);
    const restored = curveFromJSON(JSON.parse(JSON.stringify(stretched.toJSON())));
    expect(restored.equals(ellipse, 1e-9)).toBe(true);
  });
});

describe('ParametricCurve', () => {
  it('uses a supplied derivative', () => {
    const calls: number[] = [];
    const c = new ParametricCurve((t) => v(t, t * t), 0, 1, {
      derivative: (t, order) => {
        calls.push(order);
        return order === 1 ? v(1, 2 * t) : undefined;
      },
    });
    expectPoint(c.derivativeAt(0.5), v(1, 1));
    expect(calls).toEqual([1]);
    // A missing order falls back to numeric differentiation.
    expectPoint(c.derivativeAt(0.5, 2), v(0, 2), 1e-5);
  });

  it('does not differentiate across declared breakpoints', () => {
    const c = new ParametricCurve((t) => v(t, Math.abs(t - 1)), 0, 2, { breakpoints: [1] });
    expectPoint(c.derivativeAt(0.999), v(1, -1), 1e-7);
    expectPoint(c.derivativeAt(1), v(1, 1), 1e-7);
    expectPoint(c.derivativeAt(2), v(1, 1), 1e-7);
    expect(c.length).toBeCloseTo(2 * Math.SQRT2, 9);
  });

  it('limits numeric derivatives to order 4', () => {
    const c = new ParametricCurve((t) => v(t, t), 0, 1);
    expect(() => c.derivativeAt(0.5, 5)).toThrow(RangeError);
  });
});

describe('Planarity', () => {
  it('detects planar and non-planar curves', () => {
    expect(new BezierCurve([v(0, 0), v(1, 1), v(2, 0)]).isPlanar()).toBe(true);
    expect(new BezierCurve([v(0, 0), v(1, 1), v(2, 0), v(3, 1, 1)]).isPlanar()).toBe(false);
    const n = new BezierCurve([v(0, 0), v(1, 1), v(2, 0)]).planeNormal()!;
    expect(Math.abs(n.z)).toBeCloseTo(1, 12);
  });

  it('reports no area for open curves', () => {
    expect(new BezierCurve([v(0, 0), v(1, 1), v(2, 0)]).enclosedArea()).toBeUndefined();
  });

  it('reports no area for a closed non-planar curve', () => {
    expect(new Polyline([v(0, 0), v(1, 0), v(1, 1, 1), v(0, 1)], { closed: true }).enclosedArea()).toBeUndefined();
  });
});

describe('curveFromJSON', () => {
  it('rejects an unknown type', () => {
    expect(() => curveFromJSON({ type: 'Blob' })).toThrow(TypeError);
  });
});

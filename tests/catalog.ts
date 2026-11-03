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
  ParabolicArc,
  ParametricCurve,
  Polyline,
  Transform3,
  Trochoid,
  Vector3,
  type ICurve,
} from '../src/index.js';
import { v } from './helpers.js';

/** A frame that is not aligned with the world, so tests catch mixed-up local and world coordinates. */
const tilted = Frame3.fromNormal(v(1, 2, 3), v(1, 1, 2), v(1, -1, 0));

const zigzag = [v(0, 0), v(3, 1), v(5, -1), v(8, 2), v(10, 0)];
const cubicBezier = new BezierCurve([v(0, 0), v(1, 3), v(4, 3), v(5, 0)]);

/** One instance of every curve kind, used by the contract tests. */
export const catalog: Record<string, () => ICurve> = {
  Line: () => new Line(v(1, 2, 3), v(4, -1, 7)),
  Polyline: () => new Polyline(zigzag),
  'Polyline (closed)': () => new Polyline([v(0, 0), v(4, 0), v(4, 3), v(0, 3)], { closed: true }),
  Circle: () => CircularArc.circle(v(1, 2, 3), 2.5, v(0, 1, 1)),
  CircularArc: () => new CircularArc(tilted, 3, 0.4, 2.9),
  Ellipse: () => EllipticalArc.ellipse(v(1, 0, 0), 5, 2),
  EllipticalArc: () => new EllipticalArc(tilted, 4, 1.5, -0.5, 2),
  ParabolicArc: () => new ParabolicArc(tilted, 1.5, -2, 3),
  HyperbolicArc: () => new HyperbolicArc(tilted, 2, 1, -1.2, 0.8),
  BezierCurve: () => cubicBezier,
  RationalBezierCurve: () => new BezierCurve([v(0, 0), v(1, 2, 1), v(3, 2, -1), v(4, 0)], [1, 2, 0.5, 1]),
  BSplineCurve: () => BSplineCurve.uniform(3, [v(0, 0), v(1, 3), v(3, -2, 1), v(5, 3), v(7, 0), v(9, 1)]),
  NurbsCurve: () =>
    new NurbsCurve(
      2,
      [v(0, 0), v(1, 2), v(3, 2, 1), v(4, 0), v(6, -1)],
      [0, 0, 0, 1, 2.5, 4, 4, 4],
      [1, 0.5, 2, 1, 1.5],
    ),
  'BSplineCurve (interpolated)': () => BSplineCurve.interpolate(zigzag),
  HermiteSpline: () => new HermiteSpline([v(0, 0), v(2, 1), v(4, 0)], [v(1, 1), v(1, 0), v(1, -1)], [0, 1, 3]),
  CatmullRomSpline: () => new CatmullRomSpline(zigzag),
  'CatmullRomSpline (closed)': () => new CatmullRomSpline([v(0, 0), v(4, 0), v(4, 3), v(0, 3)], { closed: true }),
  CubicSpline: () => new CubicSpline(zigzag),
  'CubicSpline (closed)': () => new CubicSpline([v(0, 0), v(4, 0), v(4, 3), v(0, 3)], { closed: true }),
  Helix: () => new Helix(tilted, 2, 0.7, 2.5),
  'Helix (tapered, left-handed)': () => new Helix(Frame3.WORLD, 3, 1, 2, { taper: 0.5, leftHanded: true }),
  ArchimedeanSpiral: () => new ArchimedeanSpiral(tilted, 0.5, 0.3, 0, 12),
  LogarithmicSpiral: () => new LogarithmicSpiral(tilted, 0.5, 0.15, 0, 9),
  InvoluteCurve: () => new InvoluteCurve(tilted, 2, 0.2, 3),
  Clothoid: () => new Clothoid(tilted, 0.1, 0.25, 0, 6, 0.3),
  Trochoid: () => new Trochoid(tilted, 1, 0.6, 0, 9),
  Epitrochoid: () => new Epitrochoid(Frame3.WORLD, 3, 1, 0.5),
  Hypotrochoid: () => new Hypotrochoid(tilted, 5, 3, 1, 0, 6 * Math.PI),
  CompositeCurve: () =>
    new CompositeCurve([
      new Line(v(0, 0), v(3, 0)),
      new CircularArc(Frame3.fromNormal(v(3, 1), Vector3.Z), 1, -Math.PI / 2, Math.PI / 2),
      new Line(v(3, 2), v(0, 2)),
    ]),
  ParametricCurve: () => new ParametricCurve((t) => v(t, Math.sin(t), Math.cos(2 * t)), 0, 5),
  ReversedCurve: () => new ParametricCurve((t) => v(t, t * t), -1, 2).reversed(),
  TransformedCurve: () => CircularArc.circle(v(0, 0), 2).transformed(Transform3.scale(3, 1, 1)),
  TrimmedCurve: () => new ParametricCurve((t) => v(t, Math.sin(t)), 0, 6).trim(1, 4),
  OffsetCurve: () => cubicBezier.offset(0.1, Vector3.Z),
};

/** Curves that cannot be written to JSON, since they wrap a function. */
export const notSerializable = new Set(['ParametricCurve', 'ReversedCurve', 'TrimmedCurve']);

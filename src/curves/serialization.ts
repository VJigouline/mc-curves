import { Frame3 } from '../math/Frame3.js';
import { Transform3 } from '../math/Transform3.js';
import { Vector3 } from '../math/Vector3.js';
import { BezierCurve } from './BezierCurve.js';
import { CompositeCurve } from './CompositeCurve.js';
import { CircularArc, EllipticalArc, HyperbolicArc, ParabolicArc } from './Conics.js';
import { OffsetCurve, ReversedCurve, TransformedCurve, TrimmedCurve } from './CurveBase.js';
import { HermiteSpline } from './HermiteSpline.js';
import type { CurveJSON, ICurve } from './ICurve.js';
import { Line } from './Line.js';
import { NurbsCurve } from './NurbsCurve.js';
import { Polyline } from './Polyline.js';
import { Epitrochoid, Hypotrochoid, Trochoid } from './Roulettes.js';
import { ArchimedeanSpiral, Clothoid, Helix, InvoluteCurve, LogarithmicSpiral } from './Spirals.js';

type Json = Record<string, any>;

const point = (a: readonly number[]) => Vector3.fromArray(a);
const points = (a: readonly (readonly number[])[]) => a.map(point);

function frameOf(j: Json): Frame3 {
  const f = j['frame'];
  return Frame3.fromAxes(point(f.origin), point(f.x), point(f.y), point(f.z));
}

const readers: Record<string, (j: Json) => ICurve> = {
  Line: (j) => new Line(point(j['start']), point(j['end'])),
  Polyline: (j) => new Polyline(points(j['vertices'])),
  Circle: (j) => new CircularArc(frameOf(j), j['radius'], j['start'], j['end']),
  CircularArc: (j) => new CircularArc(frameOf(j), j['radius'], j['start'], j['end']),
  Ellipse: (j) => new EllipticalArc(frameOf(j), j['radiusX'], j['radiusY'], j['start'], j['end']),
  EllipticalArc: (j) => new EllipticalArc(frameOf(j), j['radiusX'], j['radiusY'], j['start'], j['end']),
  ParabolicArc: (j) => new ParabolicArc(frameOf(j), j['focalLength'], j['start'], j['end']),
  HyperbolicArc: (j) => new HyperbolicArc(frameOf(j), j['semiMajor'], j['semiMinor'], j['start'], j['end']),
  BezierCurve: (j) => new BezierCurve(points(j['controlPoints'])),
  RationalBezierCurve: (j) => new BezierCurve(points(j['controlPoints']), j['weights']),
  BSplineCurve: (j) => new NurbsCurve(j['degree'], points(j['controlPoints']), j['knots']),
  NurbsCurve: (j) => new NurbsCurve(j['degree'], points(j['controlPoints']), j['knots'], j['weights']),
  HermiteSpline: (j) => new HermiteSpline(points(j['points']), points(j['tangents']), j['knots']),
  Helix: (j) =>
    new Helix(frameOf(j), j['radius'], j['pitch'], (j['end'] - j['start']) / (2 * Math.PI), {
      leftHanded: j['leftHanded'],
      taper: j['taper'],
      startTurn: j['start'] / (2 * Math.PI),
    }),
  ArchimedeanSpiral: (j) => new ArchimedeanSpiral(frameOf(j), j['a'], j['b'], j['start'], j['end']),
  LogarithmicSpiral: (j) => new LogarithmicSpiral(frameOf(j), j['a'], j['b'], j['start'], j['end']),
  InvoluteCurve: (j) => new InvoluteCurve(frameOf(j), j['baseRadius'], j['start'], j['end']),
  Clothoid: (j) => new Clothoid(frameOf(j), j['startCurvature'], j['sharpness'], j['start'], j['end'], j['startHeading']),
  Trochoid: (j) => new Trochoid(frameOf(j), j['rollingRadius'], j['penDistance'], j['start'], j['end']),
  Epitrochoid: (j) => new Epitrochoid(frameOf(j), j['fixedRadius'], j['rollingRadius'], j['penDistance'], j['start'], j['end']),
  Hypotrochoid: (j) => new Hypotrochoid(frameOf(j), j['fixedRadius'], j['rollingRadius'], j['penDistance'], j['start'], j['end']),
  CompositeCurve: (j) => new CompositeCurve(j['curves'].map(curveFromJSON)),
  TrimmedCurve: (j) => new TrimmedCurve(curveFromJSON(j['curve']), j['start'], j['end']),
  ReversedCurve: (j) => new ReversedCurve(curveFromJSON(j['curve'])),
  TransformedCurve: (j) => new TransformedCurve(curveFromJSON(j['curve']), new Transform3(j['linear'], point(j['translation']))),
  OffsetCurve: (j) => new OffsetCurve(curveFromJSON(j['curve']), j['distance'], point(j['normal'])),
};

/** Rebuilds a curve from the output of `toJSON`, also after a pass through `JSON.stringify`. */
export function curveFromJSON(json: CurveJSON): ICurve {
  const reader = readers[json.type];
  if (!reader) {
    throw new TypeError(`Unknown curve type: ${json.type}`);
  }
  return reader(json);
}

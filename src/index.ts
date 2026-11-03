export { BoundingBox3 } from './math/BoundingBox3.js';
export { Frame3 } from './math/Frame3.js';
export { Transform3 } from './math/Transform3.js';
export { Vector3 } from './math/Vector3.js';

export type {
  ClosestPointResult,
  CurveDomain,
  CurveFrame,
  CurveIntersection,
  CurveJSON,
  ICurve,
  PlaneIntersection,
  Tessellation,
  TessellationOptions,
} from './curves/ICurve.js';

export { CurveBase, OffsetCurve, ReversedCurve, TransformedCurve, TrimmedCurve } from './curves/CurveBase.js';
export { FrameCurve } from './curves/FrameCurve.js';

export { Line } from './curves/Line.js';
export { Polyline } from './curves/Polyline.js';
export { CircularArc, EllipticalArc, HyperbolicArc, ParabolicArc } from './curves/Conics.js';
export { BezierCurve } from './curves/BezierCurve.js';
export { BSplineCurve, NurbsCurve } from './curves/NurbsCurve.js';
export { CatmullRomSpline, CubicSpline, HermiteSpline } from './curves/HermiteSpline.js';
export { ArchimedeanSpiral, Clothoid, Helix, InvoluteCurve, LogarithmicSpiral } from './curves/Spirals.js';
export { Epitrochoid, Hypotrochoid, Trochoid } from './curves/Roulettes.js';
export { CompositeCurve } from './curves/CompositeCurve.js';
export { ParametricCurve } from './curves/ParametricCurve.js';
export type { ParametricCurveOptions } from './curves/ParametricCurve.js';

export { curveFromJSON } from './curves/serialization.js';

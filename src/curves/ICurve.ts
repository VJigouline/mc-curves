import type { BoundingBox3 } from '../math/BoundingBox3.js';
import type { Transform3 } from '../math/Transform3.js';
import type { Vector3 } from '../math/Vector3.js';
import type { NurbsCurve } from './NurbsCurve.js';

/** The closed parameter interval a curve is defined on. */
export interface CurveDomain {
  readonly start: number;
  readonly end: number;
}

/** Frenet-style frame at a curve parameter. */
export interface CurveFrame {
  readonly origin: Vector3;
  readonly tangent: Vector3;
  readonly normal: Vector3;
  readonly binormal: Vector3;
}

export interface ClosestPointResult {
  readonly parameter: number;
  readonly point: Vector3;
  readonly distance: number;
}

export interface TessellationOptions {
  /** Maximum distance between the curve and its polyline. Default 0.01. */
  readonly chordTolerance?: number;
  /** Maximum polyline segment length. Default: unlimited. */
  readonly maxSegmentLength?: number;
}

export interface Tessellation {
  readonly points: readonly Vector3[];
  readonly parameters: readonly number[];
}

export interface CurveIntersection {
  readonly point: Vector3;
  readonly parameterA: number;
  /** Parameter on the other curve. */
  readonly parameterB: number;
  /** Distance between the two curve points, at most the requested tolerance. */
  readonly distance: number;
}

export interface PlaneIntersection {
  readonly point: Vector3;
  readonly parameter: number;
}

/** JSON form of a curve. Read it back with `curveFromJSON`. */
export interface CurveJSON {
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * The interface every curve implements.
 *
 * Curves are immutable: operations such as `trim` and `transformed` return new curves.
 * A curve is a map from its finite `domain` to 3D space, so infinite lines are not represented.
 *
 * Parameters outside the domain are clamped, except on periodic curves, where they wrap around.
 */
export interface ICurve {
  /** Curve class name, such as `Line` or `NurbsCurve`. */
  readonly type: string;
  readonly domain: CurveDomain;
  /** Polynomial degree, or `undefined` if the curve has none. */
  readonly degree: number | undefined;
  /** True if the start and end points coincide. */
  readonly isClosed: boolean;
  /** True if parameters wrap around the domain. */
  readonly isPeriodic: boolean;
  readonly startPoint: Vector3;
  readonly endPoint: Vector3;
  /** Total arc length. */
  readonly length: number;

  /** Point at parameter `t`. */
  pointAt(t: number): Vector3;
  /** Derivative with respect to the parameter, of the given order (default 1). At a joint it is the right-hand one. */
  derivativeAt(t: number, order?: number): Vector3;
  /** Unit tangent. At a cusp, the direction of the first non-zero derivative. */
  tangentAt(t: number): Vector3;
  /** Unit principal normal. On a straight part, a deterministic perpendicular to the tangent. */
  normalAt(t: number): Vector3;
  /** Unit binormal: tangent cross normal. */
  binormalAt(t: number): Vector3;
  frameAt(t: number): CurveFrame;
  /** Curvature: `|C' x C''| / |C'|^3`. Infinity at a cusp. */
  curvatureAt(t: number): number;
  /** Radius of curvature. Infinity where the curvature is zero. */
  radiusOfCurvatureAt(t: number): number;
  /** Torsion. Zero where the curvature is zero. */
  torsionAt(t: number): number;

  /** Parameter values where the curve may lose smoothness, including both domain ends. */
  breakpoints(): number[];
  /** Arc length between two parameters; both are clamped to the domain. */
  lengthBetween(t0: number, t1: number): number;
  /** Parameter at arc length `s` from the start; `s` is clamped to [0, length]. */
  parameterAtLength(s: number): number;
  pointAtLength(s: number): Vector3;
  /** `count + 1` parameters dividing the curve into pieces of equal length. */
  divideByCount(count: number): number[];
  /** Parameters at arc lengths 0, step, 2 step, and so on; the end is included only if it falls on a step. */
  divideByLength(step: number): number[];

  /** `count` points evenly spaced in the parameter. */
  sample(count: number): Vector3[];
  /** Polyline approximation within the chord tolerance. */
  tessellate(options?: TessellationOptions): Tessellation;
  boundingBox(): BoundingBox3;
  closestPoint(point: Vector3): ClosestPointResult;
  distanceTo(point: Vector3): number;
  /** All crossings of another curve. See the documentation for tangent and overlap limits. */
  intersect(other: ICurve, tolerance?: number): CurveIntersection[];
  /** Crossings of a plane. Tangent touches are not reported. */
  intersectPlane(origin: Vector3, normal: Vector3): PlaneIntersection[];

  /** True if all points lie in one plane within the tolerance. */
  isPlanar(tolerance?: number): boolean;
  /** Unit normal of the curve's plane; `undefined` for non-planar or straight curves. */
  planeNormal(tolerance?: number): Vector3 | undefined;
  /** Enclosed area of a closed planar curve, otherwise `undefined`. */
  enclosedArea(): number | undefined;

  /** The piece between two parameters. Its own parameterization may differ from this curve's. */
  trim(t0: number, t1: number): ICurve;
  /** Splits at `t` into the pieces before and after. */
  split(t: number): [ICurve, ICurve];
  /** The same geometry traversed the other way, over the same domain. */
  reversed(): ICurve;
  /** The curve under an affine transform. */
  transformed(transform: Transform3): ICurve;
  /**
   * Parallel curve at signed `distance` along `tangent x normal`.
   * `normal` defaults to the plane normal, and is required for straight or non-planar curves.
   */
  offset(distance: number, normal?: Vector3): ICurve;
  /**
   * NURBS form. Exact where the class supports it; otherwise a cubic approximation
   * within `tolerance` (default 1e-4).
   */
  toNurbs(tolerance?: number): NurbsCurve;

  /** True if both curves agree at evenly spaced normalized parameters. */
  equals(other: ICurve, tolerance?: number): boolean;
  toJSON(): CurveJSON;
}

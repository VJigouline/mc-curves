import { intersectCurves, intersectPlane } from '../algorithms/intersections.js';
import { BoundingBox3 } from '../math/BoundingBox3.js';
import {
  bisect,
  clamp,
  finiteDifferenceWeights,
  GEOMETRIC_TOLERANCE,
  goldenMinimum,
  integrate,
} from '../math/numeric.js';
import type { Transform3 } from '../math/Transform3.js';
import { Vector3 } from '../math/Vector3.js';
import type {
  ClosestPointResult,
  CurveDomain,
  CurveFrame,
  CurveIntersection,
  CurveJSON,
  ICurve,
  PlaneIntersection,
  Tessellation,
  TessellationOptions,
} from './ICurve.js';
import type { NurbsCurve } from './NurbsCurve.js';

type NurbsFactory = (degree: number, points: Vector3[], knots: number[]) => NurbsCurve;

let nurbsFactory: NurbsFactory | undefined;

/**
 * Lets `NurbsCurve` give the base class a way to build it. A direct import would be a circular
 * module dependency, since `NurbsCurve` extends `CurveBase`.
 */
export function registerNurbsFactory(factory: NurbsFactory): void {
  nurbsFactory = factory;
}

const SAMPLES_PER_SPAN = 32;

/**
 * Numeric implementation of everything in `ICurve`, given only `evaluate`.
 * Subclasses override methods where a closed form is faster or more accurate.
 */
export abstract class CurveBase implements ICurve {
  abstract readonly type: string;
  abstract readonly domain: CurveDomain;
  private cachedLength: number | undefined;

  /** Point at `t`, which is already inside the domain. */
  protected abstract evaluate(t: number): Vector3;
  abstract toJSON(): CurveJSON;

  /** Derivative at `t`, which is already inside the domain. The default is numeric, up to order 4. */
  protected evaluateDerivative(t: number, order: number): Vector3 {
    return this.numericDerivative(t, order);
  }

  get degree(): number | undefined {
    return undefined;
  }

  get isPeriodic(): boolean {
    return false;
  }

  get isClosed(): boolean {
    return this.startPoint.distanceTo(this.endPoint) <= GEOMETRIC_TOLERANCE;
  }

  get startPoint(): Vector3 {
    return this.pointAt(this.domain.start);
  }

  get endPoint(): Vector3 {
    return this.pointAt(this.domain.end);
  }

  get length(): number {
    this.cachedLength ??= this.lengthBetween(this.domain.start, this.domain.end);
    return this.cachedLength;
  }

  /** Clamps `t` to the domain, or wraps it on a periodic curve. */
  protected normalizeParameter(t: number): number {
    if (Number.isNaN(t)) {
      throw new RangeError('Curve parameter must not be NaN.');
    }
    const { start, end } = this.domain;
    if (t >= start && t <= end) {
      return t;
    }
    if (this.isPeriodic) {
      const span = end - start;
      return start + ((((t - start) % span) + span) % span);
    }
    return clamp(t, start, end);
  }

  pointAt(t: number): Vector3 {
    return this.evaluate(this.normalizeParameter(t));
  }

  derivativeAt(t: number, order = 1): Vector3 {
    if (!Number.isInteger(order) || order < 1) {
      throw new RangeError('Derivative order must be a positive integer.');
    }
    return this.evaluateDerivative(this.normalizeParameter(t), order);
  }

  private numericDerivative(t: number, order: number): Vector3 {
    if (order > 4) {
      throw new RangeError(`${this.type} supports derivatives up to order 4.`);
    }
    const breaks = this.breakpoints();
    let lo = breaks[0]!;
    let hi = breaks[breaks.length - 1]!;
    for (let i = 0; i + 1 < breaks.length; i++) {
      if (t >= breaks[i]! && t < breaks[i + 1]!) {
        lo = breaks[i]!;
        hi = breaks[i + 1]!;
        break;
      }
    }
    if (t >= hi && breaks.length >= 2) {
      lo = breaks[breaks.length - 2]!;
    }
    // Seven nodes, shifted to stay inside the smooth span.
    const h = (hi - lo) * 1e-3;
    const first = clamp(t - 3 * h, lo, hi - 6 * h);
    const nodes = Array.from({ length: 7 }, (_, i) => first + i * h);
    const weights = finiteDifferenceWeights(t, nodes, order);
    let sum = Vector3.ZERO;
    nodes.forEach((node, i) => {
      sum = sum.addScaled(this.evaluate(node), weights[i]!);
    });
    return sum;
  }

  tangentAt(t: number): Vector3 {
    for (let order = 1; order <= 3; order++) {
      const d = this.derivativeAt(t, order);
      if (d.length > 1e-12) {
        return d.normalized();
      }
    }
    throw new RangeError(`${this.type} has no tangent at parameter ${t}.`);
  }

  normalAt(t: number): Vector3 {
    const tangent = this.tangentAt(t);
    const d2 = this.derivativeAt(t, 2);
    const n = d2.addScaled(tangent, -d2.dot(tangent));
    const speed = this.derivativeAt(t).length;
    // The normal part of C'' is |C'|^2 * curvature, so compare it with the squared speed.
    return n.length > 1e-9 * Math.max(speed * speed, 1e-12) ? n.normalized() : tangent.anyPerpendicular();
  }

  binormalAt(t: number): Vector3 {
    return this.tangentAt(t).cross(this.normalAt(t)).normalized();
  }

  frameAt(t: number): CurveFrame {
    const tangent = this.tangentAt(t);
    const normal = this.normalAt(t);
    return { origin: this.pointAt(t), tangent, normal, binormal: tangent.cross(normal).normalized() };
  }

  curvatureAt(t: number): number {
    const d1 = this.derivativeAt(t, 1);
    const d2 = this.derivativeAt(t, 2);
    const speed = d1.length;
    if (speed <= 1e-12) {
      return d2.length <= 1e-12 ? 0 : Infinity;
    }
    return d1.cross(d2).length / speed ** 3;
  }

  radiusOfCurvatureAt(t: number): number {
    const k = this.curvatureAt(t);
    return k === 0 ? Infinity : 1 / k;
  }

  torsionAt(t: number): number {
    const d1 = this.derivativeAt(t, 1);
    const d2 = this.derivativeAt(t, 2);
    const c = d1.cross(d2);
    const limit = 1e-9 * Math.max(d1.lengthSquared * Math.max(d1.length, 1), 1e-12);
    return c.length <= limit ? 0 : c.dot(this.derivativeAt(t, 3)) / c.lengthSquared;
  }

  breakpoints(): number[] {
    return [this.domain.start, this.domain.end];
  }

  /** The breakpoints within [t0, t1], including both ends. */
  protected spansBetween(t0: number, t1: number): number[] {
    return [t0, ...this.breakpoints().filter((b) => b > t0 && b < t1), t1];
  }

  /** A parameter just inside `t` towards `toward`, to read one-sided values at joints. */
  private nudged(t: number, toward: number): number {
    return t + (toward - t) * 1e-9;
  }

  lengthBetween(t0: number, t1: number): number {
    const a = clamp(Math.min(t0, t1), this.domain.start, this.domain.end);
    const b = clamp(Math.max(t0, t1), this.domain.start, this.domain.end);
    const speed = (t: number) => this.evaluateDerivative(t, 1).length;
    const spans = this.spansBetween(a, b);
    let total = 0;
    for (let i = 0; i + 1 < spans.length; i++) {
      const lo = spans[i]!;
      const hi = spans[i + 1]!;
      // Start from four panels so the adaptive error test cannot be fooled by symmetry.
      for (let p = 0; p < 4; p++) {
        total += integrate(speed, lo + ((hi - lo) * p) / 4, lo + ((hi - lo) * (p + 1)) / 4);
      }
    }
    return total;
  }

  parameterAtLength(s: number): number {
    const total = this.length;
    const { start, end } = this.domain;
    if (s <= 0) {
      return start;
    }
    if (s >= total) {
      return end;
    }
    const tolerance = 1e-10 * Math.max(total, 1);
    let lo = start;
    let hi = end;
    let lengthAtLo = 0;
    let t = start + ((end - start) * s) / total;
    for (let i = 0; i < 80; i++) {
      const lengthAtT = lengthAtLo + this.lengthBetween(lo, t);
      const error = lengthAtT - s;
      if (Math.abs(error) <= tolerance) {
        return t;
      }
      if (error > 0) {
        hi = t;
      } else {
        lo = t;
        lengthAtLo = lengthAtT;
      }
      const next = t - error / this.evaluateDerivative(t, 1).length;
      t = next > lo && next < hi ? next : (lo + hi) / 2;
    }
    return t;
  }

  pointAtLength(s: number): Vector3 {
    return this.pointAt(this.parameterAtLength(s));
  }

  divideByCount(count: number): number[] {
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError('Division count must be a positive integer.');
    }
    const total = this.length;
    return Array.from({ length: count + 1 }, (_, i) =>
      i === 0 ? this.domain.start : i === count ? this.domain.end : this.parameterAtLength((total * i) / count),
    );
  }

  divideByLength(step: number): number[] {
    if (!(step > 0)) {
      throw new RangeError('Division step must be positive.');
    }
    const total = this.length;
    const count = Math.floor(total / step + 1e-9);
    return Array.from({ length: count + 1 }, (_, i) => this.parameterAtLength(i * step));
  }

  sample(count: number): Vector3[] {
    if (!Number.isInteger(count) || count < 2) {
      throw new RangeError('Sample count must be an integer of at least 2.');
    }
    const { start, end } = this.domain;
    return Array.from({ length: count }, (_, i) => this.pointAt(start + ((end - start) * i) / (count - 1)));
  }

  /** Curve parameters for coarse searches: evenly spaced within each smooth span, joints included. */
  protected searchParameters(perSpan = SAMPLES_PER_SPAN): number[] {
    const breaks = this.breakpoints();
    const result: number[] = [];
    for (let i = 0; i + 1 < breaks.length; i++) {
      const lo = breaks[i]!;
      const hi = breaks[i + 1]!;
      for (let j = 0; j < perSpan; j++) {
        result.push(lo + ((hi - lo) * j) / perSpan);
      }
    }
    result.push(breaks[breaks.length - 1]!);
    return result;
  }

  tessellate(options: TessellationOptions = {}): Tessellation {
    const tolerance = options.chordTolerance ?? 0.01;
    if (!(tolerance > 0)) {
      throw new RangeError('Chord tolerance must be positive.');
    }
    const maxLength = options.maxSegmentLength ?? Infinity;
    const parameters = [this.domain.start];
    const points = [this.pointAt(this.domain.start)];
    const emit = (t: number, p: Vector3) => {
      parameters.push(t);
      points.push(p);
    };
    const subdivide = (lo: number, pLo: Vector3, hi: number, pHi: Vector3, depth: number) => {
      const mid = (lo + hi) / 2;
      const pMid = this.pointAt(mid);
      const chord = pHi.sub(pLo);
      const deviation = (t: number, p: Vector3) => {
        const expected = pLo.lerp(pHi, (t - lo) / (hi - lo));
        const lengthSq = chord.lengthSquared;
        if (lengthSq === 0) {
          return p.distanceTo(pLo);
        }
        // Distance to the chord line, with the parametric estimate catching folded-back curves.
        const along = clamp(p.sub(pLo).dot(chord) / lengthSq, 0, 1);
        return Math.min(p.distanceTo(pLo.lerp(pHi, along)), p.distanceTo(expected));
      };
      const q1 = lo + (hi - lo) / 4;
      const q3 = hi - (hi - lo) / 4;
      const split =
        depth > 0 &&
        (chord.length > maxLength ||
          deviation(mid, pMid) > tolerance ||
          deviation(q1, this.pointAt(q1)) > tolerance ||
          deviation(q3, this.pointAt(q3)) > tolerance);
      if (split) {
        subdivide(lo, pLo, mid, pMid, depth - 1);
        subdivide(mid, pMid, hi, pHi, depth - 1);
      } else {
        emit(hi, pHi);
      }
    };
    for (const piece of this.searchSpans(8)) {
      subdivide(piece[0], this.pointAt(piece[0]), piece[1], this.pointAt(piece[1]), 20);
    }
    return { points, parameters };
  }

  private searchSpans(perSpan: number): [number, number][] {
    const p = this.searchParameters(perSpan);
    const spans: [number, number][] = [];
    for (let i = 0; i + 1 < p.length; i++) {
      spans.push([p[i]!, p[i + 1]!]);
    }
    return spans;
  }

  boundingBox(): BoundingBox3 {
    const params = this.searchParameters();
    const points = params.map((t) => this.pointAt(t));
    const components = [(v: Vector3) => v.x, (v: Vector3) => v.y, (v: Vector3) => v.z];
    for (const component of components) {
      for (let i = 0; i + 1 < params.length; i++) {
        const lo = params[i]!;
        const hi = params[i + 1]!;
        // Stay strictly inside the interval, so that joints give the derivative of this span.
        const a = this.nudged(lo, hi);
        const b = this.nudged(hi, lo);
        const slope = (t: number) => component(this.evaluateDerivative(t, 1));
        if (slope(a) < 0 !== slope(b) < 0) {
          points.push(this.pointAt(bisect(slope, a, b)));
        }
      }
    }
    return BoundingBox3.fromPoints(points);
  }

  closestPoint(point: Vector3): ClosestPointResult {
    const params = this.searchParameters();
    const distanceSq = (t: number) => this.pointAt(t).sub(point).lengthSquared;
    const values = params.map(distanceSq);
    let best = params[0]!;
    let bestValue = values[0]!;
    const consider = (t: number) => {
      const value = distanceSq(t);
      if (value < bestValue) {
        best = t;
        bestValue = value;
      }
    };
    for (let i = 0; i < params.length; i++) {
      const previous = i > 0 ? values[i - 1]! : Infinity;
      const next = i + 1 < params.length ? values[i + 1]! : Infinity;
      if (values[i]! <= previous && values[i]! <= next) {
        const lo = params[Math.max(i - 1, 0)]!;
        const hi = params[Math.min(i + 1, params.length - 1)]!;
        consider(params[i]!);
        const golden = goldenMinimum(distanceSq, lo, hi);
        consider(golden);
        consider(this.polishClosest(point, golden, lo, hi));
      }
    }
    const closest = this.pointAt(best);
    return { parameter: best, point: closest, distance: closest.distanceTo(point) };
  }

  /** Newton steps on `(C - p) . C' = 0`, which sharpen the golden-section result. */
  private polishClosest(point: Vector3, start: number, lo: number, hi: number): number {
    let t = start;
    for (let i = 0; i < 6; i++) {
      const r = this.evaluate(t).sub(point);
      const d1 = this.evaluateDerivative(t, 1);
      const denominator = d1.lengthSquared + r.dot(this.evaluateDerivative(t, 2));
      if (denominator <= 0) {
        break;
      }
      t = clamp(t - r.dot(d1) / denominator, lo, hi);
    }
    return t;
  }

  distanceTo(point: Vector3): number {
    return this.closestPoint(point).distance;
  }

  intersect(other: ICurve, tolerance?: number): CurveIntersection[] {
    return intersectCurves(this, other, tolerance);
  }

  intersectPlane(origin: Vector3, normal: Vector3): PlaneIntersection[] {
    return intersectPlane(this, origin, normal);
  }

  planeNormal(tolerance = 1e-7): Vector3 | undefined {
    const points = this.searchParameters(16).map((t) => this.pointAt(t));
    const p0 = points[0]!;
    let far = p0;
    for (const p of points) {
      if (p.distanceTo(p0) > far.distanceTo(p0)) {
        far = p;
      }
    }
    const axis = far.sub(p0);
    let normal = Vector3.ZERO;
    for (const p of points) {
      const c = axis.cross(p.sub(p0));
      if (c.length > normal.length) {
        normal = c;
      }
    }
    // A straight curve has no unique plane.
    if (axis.length === 0 || normal.length <= tolerance * axis.length) {
      return undefined;
    }
    const n = normal.normalized();
    return points.every((p) => Math.abs(p.sub(p0).dot(n)) <= tolerance) ? n : undefined;
  }

  isPlanar(tolerance = 1e-7): boolean {
    if (this.planeNormal(tolerance)) {
      return true;
    }
    // No normal means straight or non-planar: tell them apart by distance from the chord.
    const points = this.searchParameters(16).map((t) => this.pointAt(t));
    const p0 = points[0]!;
    let far = p0;
    for (const p of points) {
      if (p.distanceTo(p0) > far.distanceTo(p0)) {
        far = p;
      }
    }
    const axis = far.sub(p0);
    return (
      axis.length === 0 ||
      points.every((p) => axis.cross(p.sub(p0)).length <= tolerance * axis.length)
    );
  }

  enclosedArea(): number | undefined {
    if (!this.isClosed) {
      return undefined;
    }
    const n = this.planeNormal();
    if (!n) {
      return undefined;
    }
    const origin = this.startPoint;
    const integrand = (t: number) => this.evaluate(t).sub(origin).cross(this.evaluateDerivative(t, 1)).dot(n);
    const spans = this.spansBetween(this.domain.start, this.domain.end);
    let total = 0;
    for (let i = 0; i + 1 < spans.length; i++) {
      total += integrate(integrand, spans[i]!, spans[i + 1]!);
    }
    return Math.abs(total) / 2;
  }

  trim(t0: number, t1: number): ICurve {
    const [a, b] = this.checkedTrimRange(t0, t1);
    return new TrimmedCurve(this, a, b);
  }

  /** Validates a trim range, returning it clamped and in increasing order. */
  protected checkedTrimRange(t0: number, t1: number): [number, number] {
    const a = clamp(Math.min(t0, t1), this.domain.start, this.domain.end);
    const b = clamp(Math.max(t0, t1), this.domain.start, this.domain.end);
    if (!(b > a)) {
      throw new RangeError('Trim range must have a positive size inside the domain.');
    }
    return [a, b];
  }

  split(t: number): [ICurve, ICurve] {
    const { start, end } = this.domain;
    if (!(t > start && t < end)) {
      throw new RangeError('Split parameter must lie strictly inside the domain.');
    }
    return [this.trim(start, t), this.trim(t, end)];
  }

  reversed(): ICurve {
    return new ReversedCurve(this);
  }

  transformed(transform: Transform3): ICurve {
    return new TransformedCurve(this, transform);
  }

  offset(distance: number, normal?: Vector3): ICurve {
    return new OffsetCurve(this, distance, this.requireOffsetNormal(normal));
  }

  protected requireOffsetNormal(normal?: Vector3): Vector3 {
    const n = normal ?? this.planeNormal();
    if (!n || n.length === 0) {
      throw new RangeError('This curve has no plane of its own, so offset needs an explicit normal.');
    }
    return n.normalized();
  }

  toNurbs(tolerance = 1e-4): NurbsCurve {
    if (!nurbsFactory) {
      throw new Error('NurbsCurve is not loaded.');
    }
    const breaks = this.breakpoints();
    for (let pieces = 1; ; pieces *= 2) {
      const parameters: number[] = [];
      for (let i = 0; i + 1 < breaks.length; i++) {
        for (let j = 0; j < pieces; j++) {
          parameters.push(breaks[i]! + ((breaks[i + 1]! - breaks[i]!) * j) / pieces);
        }
      }
      parameters.push(breaks[breaks.length - 1]!);
      const nurbs = this.hermiteNurbs(parameters, nurbsFactory);
      if (pieces >= 4096 || this.maxDeviation(nurbs, parameters) <= tolerance) {
        return nurbs;
      }
    }
  }

  /** C1 piecewise cubic through the given parameters. Each piece is the Bezier form of a Hermite cubic. */
  private hermiteNurbs(parameters: readonly number[], factory: NurbsFactory): NurbsCurve {
    const points = [this.pointAt(parameters[0]!)];
    const knots = new Array<number>(4).fill(parameters[0]!);
    for (let i = 0; i + 1 < parameters.length; i++) {
      const a = parameters[i]!;
      const b = parameters[i + 1]!;
      const h = b - a;
      // One-sided derivatives: at a joint, each piece must use its own side.
      const da = this.evaluateDerivative(this.nudged(a, b), 1);
      const db = this.evaluateDerivative(this.nudged(b, a), 1);
      const pb = this.pointAt(b);
      points.push(points[points.length - 1]!.addScaled(da, h / 3), pb.addScaled(db, -h / 3), pb);
      knots.push(...new Array<number>(i + 2 === parameters.length ? 4 : 3).fill(b));
    }
    return factory(3, points, knots);
  }

  private maxDeviation(nurbs: NurbsCurve, parameters: readonly number[]): number {
    let worst = 0;
    for (let i = 0; i + 1 < parameters.length; i++) {
      const a = parameters[i]!;
      const b = parameters[i + 1]!;
      for (const f of [0.2, 0.4, 0.6, 0.8]) {
        const t = a + (b - a) * f;
        worst = Math.max(worst, this.pointAt(t).distanceTo(nurbs.pointAt(t)));
      }
    }
    return worst;
  }

  equals(other: ICurve, tolerance = 1e-7): boolean {
    const count = 33;
    for (let i = 0; i < count; i++) {
      const f = i / (count - 1);
      const t = this.domain.start + (this.domain.end - this.domain.start) * f;
      const u = other.domain.start + (other.domain.end - other.domain.start) * f;
      if (this.pointAt(t).distanceTo(other.pointAt(u)) > tolerance) {
        return false;
      }
    }
    return true;
  }
}

/** A parameter interval of another curve, with the same parameterization. */
export class TrimmedCurve extends CurveBase {
  readonly type: string = 'TrimmedCurve';
  readonly domain: CurveDomain;

  constructor(
    readonly curve: ICurve,
    start: number,
    end: number,
  ) {
    super();
    if (!(end > start)) {
      throw new RangeError('Trim range must have a positive size.');
    }
    this.domain = { start, end };
  }

  override get degree(): number | undefined {
    return this.curve.degree;
  }

  protected evaluate(t: number): Vector3 {
    return this.curve.pointAt(t);
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    return this.curve.derivativeAt(t, order);
  }

  override breakpoints(): number[] {
    const { start, end } = this.domain;
    return [start, ...this.curve.breakpoints().filter((b) => b > start && b < end), end];
  }

  override trim(t0: number, t1: number): ICurve {
    const [a, b] = this.checkedTrimRange(t0, t1);
    return new TrimmedCurve(this.curve, a, b);
  }

  toJSON(): CurveJSON {
    return { type: this.type, curve: this.curve.toJSON(), start: this.domain.start, end: this.domain.end };
  }
}

/** Another curve traversed the other way, over the same domain. */
export class ReversedCurve extends CurveBase {
  readonly type: string = 'ReversedCurve';

  constructor(readonly curve: ICurve) {
    super();
  }

  get domain(): CurveDomain {
    return this.curve.domain;
  }

  override get degree(): number | undefined {
    return this.curve.degree;
  }

  override get isPeriodic(): boolean {
    return this.curve.isPeriodic;
  }

  private mirror(t: number): number {
    return this.domain.start + this.domain.end - t;
  }

  protected evaluate(t: number): Vector3 {
    return this.curve.pointAt(this.mirror(t));
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    const d = this.curve.derivativeAt(this.mirror(t), order);
    return order % 2 === 1 ? d.negate() : d;
  }

  override breakpoints(): number[] {
    return this.curve.breakpoints().map((b) => this.mirror(b)).reverse();
  }

  override reversed(): ICurve {
    return this.curve;
  }

  toJSON(): CurveJSON {
    return { type: this.type, curve: this.curve.toJSON() };
  }
}

/** Another curve under an affine transform, with the same parameterization. */
export class TransformedCurve extends CurveBase {
  readonly type: string = 'TransformedCurve';

  constructor(
    readonly curve: ICurve,
    readonly transform: Transform3,
  ) {
    super();
  }

  get domain(): CurveDomain {
    return this.curve.domain;
  }

  override get degree(): number | undefined {
    return this.curve.degree;
  }

  override get isPeriodic(): boolean {
    return this.curve.isPeriodic;
  }

  protected evaluate(t: number): Vector3 {
    return this.transform.applyToPoint(this.curve.pointAt(t));
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    return this.transform.applyToVector(this.curve.derivativeAt(t, order));
  }

  override breakpoints(): number[] {
    return this.curve.breakpoints();
  }

  override transformed(transform: Transform3): ICurve {
    return new TransformedCurve(this.curve, transform.compose(this.transform));
  }

  toJSON(): CurveJSON {
    return {
      type: this.type,
      curve: this.curve.toJSON(),
      linear: [...this.transform.linear],
      translation: this.transform.translation.toArray(),
    };
  }
}

/**
 * Parallel curve at a constant distance along `tangent x normal`.
 * It follows the base curve exactly, so it can loop or develop cusps where the distance exceeds
 * the radius of curvature, and it leaves gaps at the joints of a curve that has corners.
 */
export class OffsetCurve extends CurveBase {
  readonly type: string = 'OffsetCurve';

  constructor(
    readonly curve: ICurve,
    readonly distance: number,
    readonly normal: Vector3,
  ) {
    super();
  }

  get domain(): CurveDomain {
    return this.curve.domain;
  }

  override get isPeriodic(): boolean {
    return this.curve.isPeriodic;
  }

  protected evaluate(t: number): Vector3 {
    const side = this.curve.tangentAt(t).cross(this.normal);
    return this.curve.pointAt(t).addScaled(side.normalized(), this.distance);
  }

  override breakpoints(): number[] {
    return this.curve.breakpoints();
  }

  toJSON(): CurveJSON {
    return { type: this.type, curve: this.curve.toJSON(), distance: this.distance, normal: this.normal.toArray() };
  }
}

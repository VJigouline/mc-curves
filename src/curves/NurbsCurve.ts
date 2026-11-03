import { clamp, rationalDerivatives, solveVectorSystem } from '../math/numeric.js';
import type { Transform3 } from '../math/Transform3.js';
import { Vector3 } from '../math/Vector3.js';
import { CurveBase, registerNurbsFactory } from './CurveBase.js';
import type { CurveDomain, CurveJSON } from './ICurve.js';

/**
 * Non-uniform rational B-spline. Omit `weights` for a plain B-spline.
 * Algorithm numbers refer to Piegl and Tiller, The NURBS Book.
 */
export class NurbsCurve extends CurveBase {
  readonly domain: CurveDomain;
  readonly controlPoints: readonly Vector3[];
  readonly knots: readonly number[];
  readonly weights: readonly number[] | undefined;
  private readonly splineDegree: number;

  constructor(degree: number, controlPoints: readonly Vector3[], knots: readonly number[], weights?: readonly number[]) {
    super();
    if (!Number.isInteger(degree) || degree < 1) {
      throw new RangeError('NURBS degree must be a positive integer.');
    }
    if (controlPoints.length < degree + 1) {
      throw new RangeError(`Degree ${degree} needs at least ${degree + 1} control points.`);
    }
    if (knots.length !== controlPoints.length + degree + 1) {
      throw new RangeError(`Expected ${controlPoints.length + degree + 1} knots, got ${knots.length}.`);
    }
    for (let i = 0; i + 1 < knots.length; i++) {
      if (!(knots[i]! <= knots[i + 1]!)) {
        throw new RangeError('Knots must be non-decreasing.');
      }
    }
    if (weights) {
      if (weights.length !== controlPoints.length) {
        throw new RangeError('There must be one weight per control point.');
      }
      if (weights.some((w) => !(w > 0))) {
        throw new RangeError('Weights must be positive.');
      }
    }
    const start = knots[degree]!;
    const end = knots[controlPoints.length]!;
    if (!(end > start)) {
      throw new RangeError('The knot vector leaves an empty domain.');
    }
    this.splineDegree = degree;
    this.controlPoints = [...controlPoints];
    this.knots = [...knots];
    this.weights = weights && weights.some((w) => w !== weights[0]) ? [...weights] : undefined;
    this.domain = { start, end };
  }

  get type(): string {
    return this.isRational ? 'NurbsCurve' : 'BSplineCurve';
  }

  override get degree(): number {
    return this.splineDegree;
  }

  get isRational(): boolean {
    return this.weights !== undefined;
  }

  private weightAt(i: number): number {
    return this.weights ? this.weights[i]! : 1;
  }

  /** Index `i` with `knots[i] <= t < knots[i + 1]`, restricted to the domain's spans. */
  private findSpan(t: number): number {
    const n = this.controlPoints.length - 1;
    const p = this.splineDegree;
    if (t >= this.knots[n + 1]!) {
      return n;
    }
    let lo = p;
    let hi = n + 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t < this.knots[mid]!) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return lo;
  }

  /** Non-zero basis functions and derivatives up to `order` at `t`. Algorithm A2.3. */
  private basisDerivatives(span: number, t: number, order: number): number[][] {
    const p = this.splineDegree;
    const U = this.knots;
    const ndu: number[][] = Array.from({ length: p + 1 }, () => new Array<number>(p + 1).fill(0));
    const left = new Array<number>(p + 1).fill(0);
    const right = new Array<number>(p + 1).fill(0);
    ndu[0]![0] = 1;
    for (let j = 1; j <= p; j++) {
      left[j] = t - U[span + 1 - j]!;
      right[j] = U[span + j]! - t;
      let saved = 0;
      for (let r = 0; r < j; r++) {
        ndu[j]![r] = right[r + 1]! + left[j - r]!;
        const temp = ndu[r]![j - 1]! / ndu[j]![r]!;
        ndu[r]![j] = saved + right[r + 1]! * temp;
        saved = left[j - r]! * temp;
      }
      ndu[j]![j] = saved;
    }
    const ders: number[][] = Array.from({ length: order + 1 }, () => new Array<number>(p + 1).fill(0));
    for (let j = 0; j <= p; j++) {
      ders[0]![j] = ndu[j]![p]!;
    }
    for (let r = 0; r <= p; r++) {
      let s1 = 0;
      let s2 = 1;
      const a: number[][] = [new Array<number>(p + 1).fill(0), new Array<number>(p + 1).fill(0)];
      a[0]![0] = 1;
      for (let k = 1; k <= order; k++) {
        let d = 0;
        const rk = r - k;
        const pk = p - k;
        if (r >= k) {
          a[s2]![0] = a[s1]![0]! / ndu[pk + 1]![rk]!;
          d = a[s2]![0]! * ndu[rk]![pk]!;
        }
        const j1 = rk >= -1 ? 1 : -rk;
        const j2 = r - 1 <= pk ? k - 1 : p - r;
        for (let j = j1; j <= j2; j++) {
          a[s2]![j] = (a[s1]![j]! - a[s1]![j - 1]!) / ndu[pk + 1]![rk + j]!;
          d += a[s2]![j]! * ndu[rk + j]![pk]!;
        }
        if (r <= pk) {
          a[s2]![k] = -a[s1]![k - 1]! / ndu[pk + 1]![r]!;
          d += a[s2]![k]! * ndu[r]![pk]!;
        }
        ders[k]![r] = d;
        [s1, s2] = [s2, s1];
      }
    }
    let factor = p;
    for (let k = 1; k <= order; k++) {
      for (let j = 0; j <= p; j++) {
        ders[k]![j]! *= factor;
      }
      factor *= p - k;
    }
    return ders;
  }

  /** Point (index 0) and derivatives up to `order`. */
  private derivativesAt(t: number, order: number): Vector3[] {
    const p = this.splineDegree;
    const span = this.findSpan(t);
    const basisOrder = Math.min(order, p);
    const ders = this.basisDerivatives(span, t, basisOrder);
    const numerator: Vector3[] = [];
    const weight: number[] = [];
    for (let k = 0; k <= order; k++) {
      let a = Vector3.ZERO;
      let w = 0;
      if (k <= basisOrder) {
        for (let j = 0; j <= p; j++) {
          const i = span - p + j;
          const wi = this.weightAt(i);
          a = a.addScaled(this.controlPoints[i]!, ders[k]![j]! * wi);
          w += ders[k]![j]! * wi;
        }
      }
      numerator.push(a);
      weight.push(w);
    }
    return this.weights ? rationalDerivatives(numerator, weight) : numerator;
  }

  protected evaluate(t: number): Vector3 {
    return this.derivativesAt(t, 0)[0]!;
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    return this.derivativesAt(t, order)[order]!;
  }

  override breakpoints(): number[] {
    const { start, end } = this.domain;
    const result = [start];
    for (const k of this.knots) {
      if (k > result[result.length - 1]! && k < end) {
        result.push(k);
      }
    }
    result.push(end);
    return result;
  }

  private multiplicity(u: number): number {
    return this.knots.filter((k) => k === u).length;
  }

  private build(points: readonly Vector3[], knots: readonly number[], weights: readonly number[]): NurbsCurve {
    return new NurbsCurve(this.splineDegree, points, knots, this.weights ? weights : undefined);
  }

  /** The same curve with the knot `u` inserted `times` more. Algorithm A5.1, applied once per copy. */
  insertKnot(u: number, times = 1): NurbsCurve {
    if (!Number.isInteger(times) || times < 0) {
      throw new RangeError('Knot insertion count must be a non-negative integer.');
    }
    if (u < this.domain.start || u > this.domain.end) {
      throw new RangeError('Inserted knot must lie inside the domain.');
    }
    if (this.multiplicity(u) + times > this.splineDegree + 1) {
      throw new RangeError('Knot multiplicity cannot exceed degree + 1.');
    }
    const p = this.splineDegree;
    let knots = [...this.knots];
    // Homogeneous control points, so that rational curves keep their exact shape.
    let hPoints = this.controlPoints.map((c, i) => c.scale(this.weightAt(i)));
    let hWeights = this.controlPoints.map((_, i) => this.weightAt(i));
    for (let copy = 0; copy < times; copy++) {
      let k = -1;
      for (let i = 0; i < knots.length; i++) {
        if (knots[i]! <= u) {
          k = i;
        }
      }
      const s = knots.filter((x) => x === u).length;
      const nextPoints: Vector3[] = [];
      const nextWeights: number[] = [];
      for (let i = 0; i <= hPoints.length; i++) {
        if (i <= k - p) {
          nextPoints.push(hPoints[i]!);
          nextWeights.push(hWeights[i]!);
        } else if (i > k - s) {
          nextPoints.push(hPoints[i - 1]!);
          nextWeights.push(hWeights[i - 1]!);
        } else {
          const alpha = (u - knots[i]!) / (knots[i + p]! - knots[i]!);
          nextPoints.push(hPoints[i - 1]!.lerp(hPoints[i]!, alpha));
          nextWeights.push(hWeights[i - 1]! + (hWeights[i]! - hWeights[i - 1]!) * alpha);
        }
      }
      knots = [...knots.slice(0, k + 1), u, ...knots.slice(k + 1)];
      hPoints = nextPoints;
      hWeights = nextWeights;
    }
    return this.build(hPoints.map((h, i) => h.scale(1 / hWeights[i]!)), knots, hWeights);
  }

  override trim(t0: number, t1: number): NurbsCurve {
    const [a, b] = this.checkedTrimRange(t0, t1);
    const p = this.splineDegree;
    let c: NurbsCurve = this;
    c = c.insertKnot(a, Math.max(p - c.multiplicity(a), 0));
    c = c.insertKnot(b, Math.max(p - c.multiplicity(b), 0));
    const lastA = c.knots.lastIndexOf(a);
    const firstB = c.knots.indexOf(b);
    const first = lastA - p;
    const points = c.controlPoints.slice(first, firstB);
    const weights = points.map((_, i) => c.weightAt(first + i));
    const knots = [
      ...new Array<number>(p + 1).fill(a),
      ...c.knots.slice(lastA + 1, firstB),
      ...new Array<number>(p + 1).fill(b),
    ];
    return this.build(points, knots, weights);
  }

  /** The pieces between consecutive distinct knots, each with a single polynomial span. */
  toBezierSegments(): NurbsCurve[] {
    const breaks = this.breakpoints();
    const result: NurbsCurve[] = [];
    for (let i = 0; i + 1 < breaks.length; i++) {
      result.push(this.trim(breaks[i]!, breaks[i + 1]!));
    }
    return result;
  }

  override reversed(): NurbsCurve {
    const { start, end } = this.domain;
    const knots = [...this.knots].reverse().map((k) => start + end - k);
    return this.build([...this.controlPoints].reverse(), knots, this.controlPoints.map((_, i) => this.weightAt(i)).reverse());
  }

  /** Exact for every affine transform, since splines are affine invariant. */
  override transformed(transform: Transform3): NurbsCurve {
    return this.build(
      this.controlPoints.map((c) => transform.applyToPoint(c)),
      this.knots,
      this.controlPoints.map((_, i) => this.weightAt(i)),
    );
  }

  override toNurbs(_tolerance?: number): NurbsCurve {
    return this;
  }

  toJSON(): CurveJSON {
    return {
      type: this.type,
      degree: this.splineDegree,
      controlPoints: this.controlPoints.map((c) => c.toArray()),
      knots: [...this.knots],
      ...(this.weights ? { weights: [...this.weights] } : {}),
    };
  }
}

registerNurbsFactory((degree, points, knots) => new NurbsCurve(degree, points, knots));

/** Non-rational NURBS, with constructors for common knot layouts. */
export class BSplineCurve extends NurbsCurve {
  constructor(degree: number, controlPoints: readonly Vector3[], knots: readonly number[]) {
    super(degree, controlPoints, knots);
  }

  /** Clamped B-spline with evenly spaced interior knots, over the domain [0, 1]. */
  static uniform(degree: number, controlPoints: readonly Vector3[]): BSplineCurve {
    const spans = controlPoints.length - degree;
    if (spans < 1) {
      throw new RangeError(`Degree ${degree} needs at least ${degree + 1} control points.`);
    }
    const knots = [
      ...new Array<number>(degree).fill(0),
      ...Array.from({ length: spans + 1 }, (_, i) => i / spans),
      ...new Array<number>(degree).fill(1),
    ];
    return new BSplineCurve(degree, controlPoints, knots);
  }

  /**
   * Global interpolation through the given points, over the domain [0, 1], with chord-length
   * parameters and averaged knots. Algorithm A9.1. Cost is cubic in the number of points.
   */
  static interpolate(points: readonly Vector3[], degree = 3): BSplineCurve {
    if (points.length < degree + 1) {
      throw new RangeError(`Degree ${degree} interpolation needs at least ${degree + 1} points.`);
    }
    const n = points.length - 1;
    const chords = points.slice(1).map((pt, i) => pt.distanceTo(points[i]!));
    const total = chords.reduce((s, c) => s + c, 0);
    if (chords.some((c) => c === 0)) {
      throw new RangeError('Interpolation points must not repeat consecutively.');
    }
    const params = [0];
    for (const c of chords) {
      params.push(clamp(params[params.length - 1]! + c / total, 0, 1));
    }
    params[n] = 1;
    const knots = new Array<number>(n + degree + 2).fill(0);
    for (let j = 1; j <= n - degree; j++) {
      let sum = 0;
      for (let i = j; i < j + degree; i++) {
        sum += params[i]!;
      }
      knots[j + degree] = sum / degree;
    }
    for (let i = n + 1; i <= n + degree + 1; i++) {
      knots[i] = 1;
    }
    // Basis functions at each parameter, read from a spline with unit-vector control points.
    const probe = new BSplineBasis(degree, knots);
    const matrix = params.map((u) => probe.row(u, n + 1));
    return new BSplineCurve(degree, solveVectorSystem(matrix, points), knots);
  }
}

/** Plain evaluation of B-spline basis functions, for building interpolation systems. */
class BSplineBasis {
  constructor(
    private readonly degree: number,
    private readonly knots: readonly number[],
  ) {}

  /** The values of all `count` basis functions at `u` (The NURBS Book, A2.2). */
  row(u: number, count: number): number[] {
    const p = this.degree;
    const U = this.knots;
    let span = count - 1;
    if (u < U[count]!) {
      span = p;
      while (u >= U[span + 1]!) {
        span++;
      }
    }
    const values = new Array<number>(p + 1).fill(0);
    const left = new Array<number>(p + 1).fill(0);
    const right = new Array<number>(p + 1).fill(0);
    values[0] = 1;
    for (let j = 1; j <= p; j++) {
      left[j] = u - U[span + 1 - j]!;
      right[j] = U[span + j]! - u;
      let saved = 0;
      for (let r = 0; r < j; r++) {
        const temp = values[r]! / (right[r + 1]! + left[j - r]!);
        values[r] = saved + right[r + 1]! * temp;
        saved = left[j - r]! * temp;
      }
      values[j] = saved;
    }
    const row = new Array<number>(count).fill(0);
    values.forEach((v, j) => {
      row[span - p + j] = v;
    });
    return row;
  }
}

import { solveVectorSystem } from '../math/numeric.js';
import type { Transform3 } from '../math/Transform3.js';
import { Vector3 } from '../math/Vector3.js';
import { CurveBase } from './CurveBase.js';
import type { CurveDomain, CurveJSON } from './ICurve.js';
import { NurbsCurve } from './NurbsCurve.js';

/** Piecewise cubic through points with given tangents, C1 at the knots. */
export class HermiteSpline extends CurveBase {
  readonly domain: CurveDomain;
  readonly points: readonly Vector3[];
  readonly tangents: readonly Vector3[];
  readonly knots: readonly number[];

  /** `knots` default to 0, 1, 2, and so on. Tangents are derivatives with respect to the parameter. */
  constructor(points: readonly Vector3[], tangents: readonly Vector3[], knots?: readonly number[]) {
    super();
    if (points.length < 2) {
      throw new RangeError('A spline needs at least two points.');
    }
    if (tangents.length !== points.length) {
      throw new RangeError('There must be one tangent per point.');
    }
    const k = knots ?? points.map((_, i) => i);
    if (k.length !== points.length) {
      throw new RangeError('There must be one knot per point.');
    }
    for (let i = 0; i + 1 < k.length; i++) {
      if (!(k[i + 1]! > k[i]!)) {
        throw new RangeError('Spline knots must be strictly increasing.');
      }
    }
    this.points = [...points];
    this.tangents = [...tangents];
    this.knots = [...k];
    this.domain = { start: k[0]!, end: k[k.length - 1]! };
  }

  get type(): string {
    return 'HermiteSpline';
  }

  override get degree(): number {
    return 3;
  }

  private segment(t: number): number {
    let lo = 0;
    let hi = this.knots.length - 1;
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

  /** Point (`order` 0) or derivative on the segment that holds `t`. */
  private cubic(t: number, order: number): Vector3 {
    if (order > 3) {
      return Vector3.ZERO;
    }
    const i = this.segment(t);
    const h = this.knots[i + 1]! - this.knots[i]!;
    const u = (t - this.knots[i]!) / h;
    const p0 = this.points[i]!;
    const p1 = this.points[i + 1]!;
    const m0 = this.tangents[i]!.scale(h);
    const m1 = this.tangents[i + 1]!.scale(h);
    // Power form: a u^3 + b u^2 + c u + d.
    const a = p0.sub(p1).scale(2).add(m0).add(m1);
    const b = p1.sub(p0).scale(3).sub(m0.scale(2)).sub(m1);
    switch (order) {
      case 0:
        return a.scale(u * u * u).addScaled(b, u * u).addScaled(m0, u).add(p0);
      case 1:
        return a.scale((3 * u * u) / h).addScaled(b, (2 * u) / h).addScaled(m0, 1 / h);
      case 2:
        return a.scale((6 * u) / (h * h)).addScaled(b, 2 / (h * h));
      default:
        return a.scale(6 / (h * h * h));
    }
  }

  protected evaluate(t: number): Vector3 {
    return this.cubic(t, 0);
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    return this.cubic(t, order);
  }

  override breakpoints(): number[] {
    return [...this.knots];
  }

  override reversed(): HermiteSpline {
    const { start, end } = this.domain;
    return new HermiteSpline(
      [...this.points].reverse(),
      [...this.tangents].reverse().map((m) => m.negate()),
      [...this.knots].reverse().map((k) => start + end - k),
    );
  }

  /** Exact for every affine transform. */
  override transformed(transform: Transform3): HermiteSpline {
    return new HermiteSpline(
      this.points.map((p) => transform.applyToPoint(p)),
      this.tangents.map((m) => transform.applyToVector(m)),
      this.knots,
    );
  }

  /** Exact, and keeps the parameterization: each segment becomes a cubic Bezier piece. */
  override toNurbs(_tolerance?: number): NurbsCurve {
    const points = [this.points[0]!];
    const knots = new Array<number>(4).fill(this.knots[0]!);
    for (let i = 0; i + 1 < this.points.length; i++) {
      const b = this.knots[i + 1]!;
      const h = b - this.knots[i]!;
      points.push(
        this.points[i]!.addScaled(this.tangents[i]!, h / 3),
        this.points[i + 1]!.addScaled(this.tangents[i + 1]!, -h / 3),
        this.points[i + 1]!,
      );
      knots.push(...new Array<number>(i + 2 === this.points.length ? 4 : 3).fill(b));
    }
    return new NurbsCurve(3, points, knots);
  }

  toJSON(): CurveJSON {
    return {
      type: 'HermiteSpline',
      points: this.points.map((p) => p.toArray()),
      tangents: this.tangents.map((m) => m.toArray()),
      knots: [...this.knots],
    };
  }
}

/**
 * Catmull-Rom spline through the given points, C1, with tangents derived from neighbouring points.
 * `alpha` sets the knot spacing: 0 uniform, 0.5 centripetal (the default, which avoids
 * cusps and self-intersections within a segment), 1 chordal.
 */
export class CatmullRomSpline extends HermiteSpline {
  constructor(points: readonly Vector3[], options: { alpha?: number; closed?: boolean } = {}) {
    const alpha = options.alpha ?? 0.5;
    const closed = options.closed ?? false;
    if (points.length < (closed ? 3 : 2)) {
      throw new RangeError('Too few points for a Catmull-Rom spline.');
    }
    const list = closed ? [...points, points[0]!] : [...points];
    const knots = [0];
    for (let i = 0; i + 1 < list.length; i++) {
      const d = list[i]!.distanceTo(list[i + 1]!);
      if (d === 0) {
        throw new RangeError('Spline points must not repeat consecutively.');
      }
      knots.push(knots[i]! + d ** alpha);
    }
    const last = list.length - 1;
    const tangents = list.map((p, i) => {
      if (closed && (i === 0 || i === last)) {
        // Neighbours wrap around the seam, keeping the curve C1 there.
        const h0 = knots[last]! - knots[last - 1]!;
        const h1 = knots[1]! - knots[0]!;
        return blendedTangent(list[last - 1]!, p, list[1]!, h0, h1);
      }
      if (i === 0) {
        return list[1]!.sub(p).scale(1 / (knots[1]! - knots[0]!));
      }
      if (i === last) {
        return p.sub(list[last - 1]!).scale(1 / (knots[last]! - knots[last - 1]!));
      }
      return blendedTangent(list[i - 1]!, p, list[i + 1]!, knots[i]! - knots[i - 1]!, knots[i + 1]! - knots[i]!);
    });
    super(list, tangents, knots);
  }

  override get type(): string {
    return 'CatmullRomSpline';
  }
}

/** Non-uniform Catmull-Rom tangent: the derivative of the quadratic through three points. */
function blendedTangent(prev: Vector3, p: Vector3, next: Vector3, h0: number, h1: number): Vector3 {
  const before = p.sub(prev).scale(1 / h0);
  const after = next.sub(p).scale(1 / h1);
  return before.scale(h1 / (h0 + h1)).addScaled(after, h0 / (h0 + h1));
}

/**
 * C2 cubic spline through the given points, over chord-length knots.
 * Ends are natural (zero second derivative) unless end tangents are given. `closed` gives a
 * periodic spline. Cost is cubic in the number of points.
 */
export class CubicSpline extends HermiteSpline {
  constructor(
    points: readonly Vector3[],
    options: { startTangent?: Vector3; endTangent?: Vector3; closed?: boolean } = {},
  ) {
    const closed = options.closed ?? false;
    if (points.length < (closed ? 3 : 2)) {
      throw new RangeError('Too few points for a cubic spline.');
    }
    const list = closed ? [...points, points[0]!] : [...points];
    const knots = [0];
    for (let i = 0; i + 1 < list.length; i++) {
      const d = list[i]!.distanceTo(list[i + 1]!);
      if (d === 0) {
        throw new RangeError('Spline points must not repeat consecutively.');
      }
      knots.push(knots[i]! + d);
    }
    super(list, closed ? closedTangents(list, knots) : openTangents(list, knots, options), knots);
  }

  override get type(): string {
    return 'CubicSpline';
  }
}

/** Slope difference term of the C2 condition at interior point `i`. */
function c2Rhs(list: readonly Vector3[], before: number, after: number, h0: number, h1: number, at: number): Vector3 {
  return list[at]!
    .sub(list[before]!)
    .scale(3 / (h0 * h0))
    .add(list[after]!.sub(list[at]!).scale(3 / (h1 * h1)));
}

function openTangents(
  list: readonly Vector3[],
  knots: readonly number[],
  options: { startTangent?: Vector3; endTangent?: Vector3 },
): Vector3[] {
  const n = list.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rhs = new Array<Vector3>(n);
  const h = (i: number) => knots[i + 1]! - knots[i]!;
  if (options.startTangent) {
    matrix[0]![0] = 1;
    rhs[0] = options.startTangent;
  } else {
    matrix[0]![0] = 2;
    matrix[0]![1] = 1;
    rhs[0] = list[1]!.sub(list[0]!).scale(3 / h(0));
  }
  if (options.endTangent) {
    matrix[n - 1]![n - 1] = 1;
    rhs[n - 1] = options.endTangent;
  } else {
    matrix[n - 1]![n - 2] = 1;
    matrix[n - 1]![n - 1] = 2;
    rhs[n - 1] = list[n - 1]!.sub(list[n - 2]!).scale(3 / h(n - 2));
  }
  for (let i = 1; i + 1 < n; i++) {
    const h0 = h(i - 1);
    const h1 = h(i);
    matrix[i]![i - 1] = 1 / h0;
    matrix[i]![i] = 2 * (1 / h0 + 1 / h1);
    matrix[i]![i + 1] = 1 / h1;
    rhs[i] = c2Rhs(list, i - 1, i + 1, h0, h1, i);
  }
  return solveVectorSystem(matrix, rhs);
}

/** Periodic system: the last point repeats the first, so there are `n - 1` unknowns. */
function closedTangents(list: readonly Vector3[], knots: readonly number[]): Vector3[] {
  const n = list.length - 1;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rhs = new Array<Vector3>(n);
  const h = (i: number) => knots[((i % n) + n) % n + 1]! - knots[((i % n) + n) % n]!;
  for (let i = 0; i < n; i++) {
    const h0 = h(i - 1);
    const h1 = h(i);
    matrix[i]![(i + n - 1) % n]! += 1 / h0;
    matrix[i]![i]! += 2 * (1 / h0 + 1 / h1);
    matrix[i]![(i + 1) % n]! += 1 / h1;
    rhs[i] = c2Rhs(list, (i + n - 1) % n, (i + 1) % n, h0, h1, i);
  }
  const tangents = solveVectorSystem(matrix, rhs);
  return [...tangents, tangents[0]!];
}

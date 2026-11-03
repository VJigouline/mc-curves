import { binomial, rationalDerivatives } from '../math/numeric.js';
import type { Transform3 } from '../math/Transform3.js';
import { Vector3 } from '../math/Vector3.js';
import { CurveBase } from './CurveBase.js';
import type { CurveDomain, CurveJSON } from './ICurve.js';
import { NurbsCurve } from './NurbsCurve.js';

/** Bezier curve of any degree over [0, 1]. Supply `weights` for the rational form. */
export class BezierCurve extends CurveBase {
  readonly domain: CurveDomain = { start: 0, end: 1 };
  readonly controlPoints: readonly Vector3[];
  readonly weights: readonly number[] | undefined;

  constructor(controlPoints: readonly Vector3[], weights?: readonly number[]) {
    super();
    if (controlPoints.length < 2) {
      throw new RangeError('A Bezier curve needs at least two control points.');
    }
    if (weights) {
      if (weights.length !== controlPoints.length) {
        throw new RangeError('There must be one weight per control point.');
      }
      if (weights.some((w) => !(w > 0))) {
        throw new RangeError('Weights must be positive.');
      }
    }
    this.controlPoints = [...controlPoints];
    this.weights = weights && weights.some((w) => w !== weights[0]) ? [...weights] : undefined;
  }

  get type(): string {
    return this.weights ? 'RationalBezierCurve' : 'BezierCurve';
  }

  override get degree(): number {
    return this.controlPoints.length - 1;
  }

  private weightAt(i: number): number {
    return this.weights ? this.weights[i]! : 1;
  }

  private homogeneous(): { points: Vector3[]; weights: number[] } {
    return {
      points: this.controlPoints.map((c, i) => c.scale(this.weightAt(i))),
      weights: this.controlPoints.map((_, i) => this.weightAt(i)),
    };
  }

  /** Point (index 0) and derivatives up to `order`, from de Casteljau on the k-th differences. */
  private derivativesAt(t: number, order: number): Vector3[] {
    let { points, weights } = this.homogeneous();
    const numerator: Vector3[] = [];
    const weight: number[] = [];
    let factor = 1;
    let n = this.degree;
    for (let k = 0; k <= order; k++) {
      if (k > this.degree) {
        numerator.push(Vector3.ZERO);
        weight.push(0);
        continue;
      }
      let p = points;
      let w = weights;
      while (p.length > 1) {
        p = p.slice(1).map((pt, i) => p[i]!.lerp(pt, t));
        w = w.slice(1).map((wt, i) => w[i]! + (wt - w[i]!) * t);
      }
      numerator.push(p[0]!.scale(factor));
      weight.push(w[0]! * factor);
      factor *= n;
      n--;
      points = points.slice(1).map((pt, i) => pt.sub(points[i]!));
      weights = weights.slice(1).map((wt, i) => wt - weights[i]!);
    }
    return this.weights ? rationalDerivatives(numerator, weight) : numerator;
  }

  protected evaluate(t: number): Vector3 {
    return this.derivativesAt(t, 0)[0]!;
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    return this.derivativesAt(t, order)[order]!;
  }

  /** Exact split by de Casteljau. Both pieces have the domain [0, 1]. */
  private splitAt(t: number): [BezierCurve, BezierCurve] {
    let { points, weights } = this.homogeneous();
    const leftP = [points[0]!];
    const leftW = [weights[0]!];
    const rightP = [points[points.length - 1]!];
    const rightW = [weights[weights.length - 1]!];
    while (points.length > 1) {
      const p = points;
      const w = weights;
      points = p.slice(1).map((pt, i) => p[i]!.lerp(pt, t));
      weights = w.slice(1).map((wt, i) => w[i]! + (wt - w[i]!) * t);
      leftP.push(points[0]!);
      leftW.push(weights[0]!);
      rightP.unshift(points[points.length - 1]!);
      rightW.unshift(weights[weights.length - 1]!);
    }
    const make = (hp: Vector3[], hw: number[]) =>
      new BezierCurve(hp.map((h, i) => h.scale(1 / hw[i]!)), this.weights ? hw : undefined);
    return [make(leftP, leftW), make(rightP, rightW)];
  }

  override trim(t0: number, t1: number): BezierCurve {
    const [a, b] = this.checkedTrimRange(t0, t1);
    const right = a > 0 ? this.splitAt(a)[1] : this;
    return b < 1 ? right.splitAt((b - a) / (1 - a))[0] : right;
  }

  override reversed(): BezierCurve {
    return new BezierCurve([...this.controlPoints].reverse(), this.weights ? [...this.weights].reverse() : undefined);
  }

  /** Exact for every affine transform. */
  override transformed(transform: Transform3): BezierCurve {
    return new BezierCurve(this.controlPoints.map((c) => transform.applyToPoint(c)), this.weights);
  }

  /** The same curve with degree raised by one. */
  elevated(): BezierCurve {
    const { points, weights } = this.homogeneous();
    const n = points.length;
    const nextP: Vector3[] = [points[0]!];
    const nextW: number[] = [weights[0]!];
    for (let i = 1; i < n; i++) {
      const f = i / n;
      nextP.push(points[i]!.lerp(points[i - 1]!, f));
      nextW.push(weights[i]! + (weights[i - 1]! - weights[i]!) * f);
    }
    nextP.push(points[n - 1]!);
    nextW.push(weights[n - 1]!);
    return new BezierCurve(nextP.map((h, i) => h.scale(1 / nextW[i]!)), this.weights ? nextW : undefined);
  }

  /** Bernstein basis value `B(i, degree)` at `t`. */
  static bernstein(degree: number, i: number, t: number): number {
    return binomial(degree, i) * t ** i * (1 - t) ** (degree - i);
  }

  override toNurbs(_tolerance?: number): NurbsCurve {
    const p = this.degree;
    const knots = [...new Array<number>(p + 1).fill(0), ...new Array<number>(p + 1).fill(1)];
    return new NurbsCurve(p, this.controlPoints, knots, this.weights);
  }

  toJSON(): CurveJSON {
    return {
      type: this.type,
      controlPoints: this.controlPoints.map((c) => c.toArray()),
      ...(this.weights ? { weights: [...this.weights] } : {}),
    };
  }
}

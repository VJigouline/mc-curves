import { BoundingBox3 } from '../math/BoundingBox3.js';
import { clamp } from '../math/numeric.js';
import type { Transform3 } from '../math/Transform3.js';
import { Vector3 } from '../math/Vector3.js';
import { CurveBase } from './CurveBase.js';
import type { ClosestPointResult, CurveDomain, CurveJSON, Tessellation, TessellationOptions } from './ICurve.js';
import { NurbsCurve } from './NurbsCurve.js';

/** Straight segment: `C(t) = start + t (end - start)`, t in [0, 1]. */
export class Line extends CurveBase {
  readonly type = 'Line';
  readonly domain: CurveDomain = { start: 0, end: 1 };

  constructor(
    readonly start: Vector3,
    readonly end: Vector3,
  ) {
    super();
    if (start.equals(end, 0)) {
      throw new RangeError('A line needs two different points.');
    }
  }

  override get degree(): number {
    return 1;
  }

  override get isClosed(): boolean {
    return false;
  }

  override get length(): number {
    return this.start.distanceTo(this.end);
  }

  protected evaluate(t: number): Vector3 {
    return this.start.lerp(this.end, t);
  }

  protected override evaluateDerivative(_t: number, order: number): Vector3 {
    return order === 1 ? this.end.sub(this.start) : Vector3.ZERO;
  }

  override lengthBetween(t0: number, t1: number): number {
    return Math.abs(clamp(t1, 0, 1) - clamp(t0, 0, 1)) * this.length;
  }

  override parameterAtLength(s: number): number {
    return clamp(s / this.length, 0, 1);
  }

  override tessellate(_options?: TessellationOptions): Tessellation {
    return { points: [this.start, this.end], parameters: [0, 1] };
  }

  override boundingBox(): BoundingBox3 {
    return BoundingBox3.fromPoints([this.start, this.end]);
  }

  override closestPoint(point: Vector3): ClosestPointResult {
    const d = this.end.sub(this.start);
    const parameter = clamp(point.sub(this.start).dot(d) / d.lengthSquared, 0, 1);
    const closest = this.evaluate(parameter);
    return { parameter, point: closest, distance: closest.distanceTo(point) };
  }

  override planeNormal(_tolerance?: number): undefined {
    return undefined;
  }

  override isPlanar(_tolerance?: number): boolean {
    return true;
  }

  override enclosedArea(): undefined {
    return undefined;
  }

  override trim(t0: number, t1: number): Line {
    const [a, b] = this.checkedTrimRange(t0, t1);
    return new Line(this.evaluate(a), this.evaluate(b));
  }

  override reversed(): Line {
    return new Line(this.end, this.start);
  }

  override transformed(transform: Transform3): Line {
    return new Line(transform.applyToPoint(this.start), transform.applyToPoint(this.end));
  }

  override offset(distance: number, normal?: Vector3): Line {
    const shift = this.end.sub(this.start).cross(this.requireOffsetNormal(normal)).normalized().scale(distance);
    return new Line(this.start.add(shift), this.end.add(shift));
  }

  override toNurbs(_tolerance?: number): NurbsCurve {
    return new NurbsCurve(1, [this.start, this.end], [0, 0, 1, 1]);
  }

  toJSON(): CurveJSON {
    return { type: this.type, start: this.start.toArray(), end: this.end.toArray() };
  }
}

import { BoundingBox3 } from '../math/BoundingBox3.js';
import { GEOMETRIC_TOLERANCE, clamp } from '../math/numeric.js';
import type { Transform3 } from '../math/Transform3.js';
import { Vector3 } from '../math/Vector3.js';
import { CurveBase } from './CurveBase.js';
import type { ClosestPointResult, CurveDomain, CurveJSON, Tessellation, TessellationOptions } from './ICurve.js';
import { NurbsCurve } from './NurbsCurve.js';

/**
 * Chain of straight segments. The parameter is the vertex index, so `pointAt(2.5)` is the middle
 * of the third segment. A closed polyline repeats its first vertex at the end.
 */
export class Polyline extends CurveBase {
  readonly type = 'Polyline';
  readonly domain: CurveDomain;
  readonly vertices: readonly Vector3[];

  constructor(vertices: readonly Vector3[], options: { closed?: boolean } = {}) {
    super();
    const list = [...vertices];
    if (options.closed && !list[0]?.equals(list[list.length - 1]!, GEOMETRIC_TOLERANCE)) {
      list.push(list[0]!);
    }
    if (list.length < 2) {
      throw new RangeError('A polyline needs at least two vertices.');
    }
    for (let i = 0; i + 1 < list.length; i++) {
      if (list[i]!.equals(list[i + 1]!, 0)) {
        throw new RangeError(`Polyline vertices ${i} and ${i + 1} coincide.`);
      }
    }
    this.vertices = list;
    this.domain = { start: 0, end: list.length - 1 };
  }

  override get degree(): number {
    return 1;
  }

  private segmentIndex(t: number): number {
    return Math.min(Math.floor(t), this.vertices.length - 2);
  }

  protected evaluate(t: number): Vector3 {
    const i = this.segmentIndex(t);
    return this.vertices[i]!.lerp(this.vertices[i + 1]!, t - i);
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    if (order > 1) {
      return Vector3.ZERO;
    }
    const i = this.segmentIndex(t);
    return this.vertices[i + 1]!.sub(this.vertices[i]!);
  }

  override breakpoints(): number[] {
    return this.vertices.map((_, i) => i);
  }

  override lengthBetween(t0: number, t1: number): number {
    const a = clamp(Math.min(t0, t1), this.domain.start, this.domain.end);
    const b = clamp(Math.max(t0, t1), this.domain.start, this.domain.end);
    const stops = this.spansBetween(a, b);
    let total = 0;
    for (let i = 0; i + 1 < stops.length; i++) {
      total += this.evaluate(stops[i]!).distanceTo(this.evaluate(stops[i + 1]!));
    }
    return total;
  }

  override tessellate(_options?: TessellationOptions): Tessellation {
    return { points: this.vertices, parameters: this.breakpoints() };
  }

  override boundingBox(): BoundingBox3 {
    return BoundingBox3.fromPoints(this.vertices);
  }

  override closestPoint(point: Vector3): ClosestPointResult {
    let best: ClosestPointResult | undefined;
    for (let i = 0; i + 1 < this.vertices.length; i++) {
      const a = this.vertices[i]!;
      const d = this.vertices[i + 1]!.sub(a);
      const f = clamp(point.sub(a).dot(d) / d.lengthSquared, 0, 1);
      const p = a.addScaled(d, f);
      const distance = p.distanceTo(point);
      if (!best || distance < best.distance) {
        best = { parameter: i + f, point: p, distance };
      }
    }
    return best!;
  }

  override trim(t0: number, t1: number): Polyline {
    const [a, b] = this.checkedTrimRange(t0, t1);
    return new Polyline(this.spansBetween(a, b).map((t) => this.evaluate(t)));
  }

  override reversed(): Polyline {
    return new Polyline([...this.vertices].reverse());
  }

  override transformed(transform: Transform3): Polyline {
    return new Polyline(this.vertices.map((v) => transform.applyToPoint(v)));
  }

  /** Offset with mitred corners. Collinear or sharply folded corners are not trimmed. */
  override offset(distance: number, normal?: Vector3): Polyline {
    const n = this.requireOffsetNormal(normal);
    const count = this.vertices.length;
    const sides: Vector3[] = [];
    for (let i = 0; i + 1 < count; i++) {
      sides.push(this.vertices[i + 1]!.sub(this.vertices[i]!).cross(n).normalized());
    }
    const closed = this.isClosed;
    const miter = (a: Vector3, b: Vector3) => a.add(b).scale(distance / (1 + a.dot(b)));
    const vertices = this.vertices.map((v, i) => {
      if (i === 0 || i === count - 1) {
        if (closed) {
          return v.add(miter(sides[sides.length - 1]!, sides[0]!));
        }
        return v.addScaled(sides[i === 0 ? 0 : sides.length - 1]!, distance);
      }
      return v.add(miter(sides[i - 1]!, sides[i]!));
    });
    return new Polyline(vertices);
  }

  override toNurbs(_tolerance?: number): NurbsCurve {
    const last = this.vertices.length - 1;
    return new NurbsCurve(1, this.vertices, [0, ...this.breakpoints(), last]);
  }

  toJSON(): CurveJSON {
    return { type: this.type, vertices: this.vertices.map((v) => v.toArray()) };
  }
}

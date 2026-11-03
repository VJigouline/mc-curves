import { Frame3 } from '../math/Frame3.js';
import { GEOMETRIC_TOLERANCE, clamp, cosDerivative, sinDerivative } from '../math/numeric.js';
import { Vector3 } from '../math/Vector3.js';
import { FrameCurve } from './FrameCurve.js';
import type { ClosestPointResult, ICurve } from './ICurve.js';
import { NurbsCurve } from './NurbsCurve.js';

const TWO_PI = 2 * Math.PI;

function requirePositive(value: number, name: string): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be positive and finite.`);
  }
}

/** Exact rational quadratic form of an elliptic arc, using at most 90 degrees per piece. */
function ellipticNurbs(frame: Frame3, a: number, b: number, start: number, end: number): NurbsCurve {
  const pieces = Math.max(Math.ceil((end - start) / (Math.PI / 2) - 1e-9), 1);
  const half = (end - start) / (2 * pieces);
  const onCurve = (t: number) => frame.toWorld(new Vector3(a * Math.cos(t), b * Math.sin(t)));
  const points = [onCurve(start)];
  const weights = [1];
  const knots = [start, start, start];
  for (let i = 0; i < pieces; i++) {
    const mid = start + half * (2 * i + 1);
    const next = start + 2 * half * (i + 1);
    // The tangents at the piece ends meet here: the mid-angle direction, pushed out by 1 / cos(half).
    points.push(frame.toWorld(new Vector3((a * Math.cos(mid)) / Math.cos(half), (b * Math.sin(mid)) / Math.cos(half))));
    weights.push(Math.cos(half));
    points.push(onCurve(next));
    weights.push(1);
    knots.push(...(i + 1 === pieces ? [end, end, end] : [next, next]));
  }
  return new NurbsCurve(2, points, knots, weights);
}

/**
 * Circular arc: `center + r (cos t, sin t)` in the frame, with `t` the angle in radians.
 * An arc spanning a full turn is a circle, and has the type name `Circle`.
 */
export class CircularArc extends FrameCurve {
  constructor(
    frame: Frame3,
    readonly radius: number,
    startAngle = 0,
    endAngle = TWO_PI,
  ) {
    super(frame, startAngle, endAngle);
    requirePositive(radius, 'Radius');
    if (endAngle - startAngle > TWO_PI + 1e-12) {
      throw new RangeError('An arc cannot span more than a full turn.');
    }
  }

  static circle(center: Vector3, radius: number, normal: Vector3 = Vector3.Z): CircularArc {
    return new CircularArc(Frame3.fromNormal(center, normal), radius);
  }

  /** The arc from `a` through `b` to `c`. */
  static fromThreePoints(a: Vector3, b: Vector3, c: Vector3): CircularArc {
    const ab = b.sub(a);
    const ac = c.sub(a);
    const normal = ab.cross(ac);
    if (normal.length <= 1e-12 * ab.length * ac.length) {
      throw new RangeError('Three collinear points do not define an arc.');
    }
    const toCenter = normal
      .cross(ab)
      .scale(ac.lengthSquared)
      .add(ac.cross(normal).scale(ab.lengthSquared))
      .scale(1 / (2 * normal.lengthSquared));
    const center = a.add(toCenter);
    const frame = Frame3.fromNormal(center, normal, a.sub(center));
    const angleOf = (p: Vector3) => {
      const l = frame.toLocal(p);
      const angle = Math.atan2(l.y, l.x);
      return angle < 0 ? angle + TWO_PI : angle;
    };
    return new CircularArc(frame, toCenter.length, 0, angleOf(c));
  }

  get center(): Vector3 {
    return this.frame.origin;
  }

  get sweep(): number {
    return this.domain.end - this.domain.start;
  }

  private get isFullTurn(): boolean {
    return Math.abs(this.sweep - TWO_PI) <= 1e-12;
  }

  get type(): string {
    return this.isFullTurn ? 'Circle' : 'CircularArc';
  }

  override get isPeriodic(): boolean {
    return this.isFullTurn;
  }

  override get length(): number {
    return this.radius * this.sweep;
  }

  protected local(t: number, order: number): Vector3 {
    return new Vector3(this.radius * cosDerivative(1, t, order), this.radius * sinDerivative(1, t, order));
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): CircularArc {
    return new CircularArc(frame, this.radius * scale, start, end);
  }

  override lengthBetween(t0: number, t1: number): number {
    const { start, end } = this.domain;
    return this.radius * Math.abs(clamp(t1, start, end) - clamp(t0, start, end));
  }

  override parameterAtLength(s: number): number {
    return this.domain.start + clamp(s, 0, this.length) / this.radius;
  }

  override curvatureAt(_t?: number): number {
    return 1 / this.radius;
  }

  override torsionAt(_t?: number): number {
    return 0;
  }

  override enclosedArea(): number | undefined {
    return this.isFullTurn ? Math.PI * this.radius * this.radius : undefined;
  }

  override closestPoint(point: Vector3): ClosestPointResult {
    const l = this.frame.toLocal(point);
    const { start, end } = this.domain;
    const candidates = [start, end];
    if (Math.hypot(l.x, l.y) > GEOMETRIC_TOLERANCE) {
      const angle = Math.atan2(l.y, l.x);
      const lifted = angle + TWO_PI * Math.ceil((start - angle) / TWO_PI);
      if (lifted <= end) {
        candidates.push(lifted);
      }
    }
    let best: ClosestPointResult | undefined;
    for (const parameter of candidates) {
      const p = this.evaluate(parameter);
      const distance = p.distanceTo(point);
      if (!best || distance < best.distance) {
        best = { parameter, point: p, distance };
      }
    }
    return best!;
  }

  override reversed(): CircularArc {
    return new CircularArc(this.frame.flippedY(), this.radius, -this.domain.end, -this.domain.start);
  }

  /** Exact when `normal` is perpendicular to the arc's plane. Positive distances grow a counter-clockwise arc. */
  override offset(distance: number, normal?: Vector3): ICurve {
    const n = normal?.normalized() ?? this.frame.planeNormal;
    const alignment = n.dot(this.frame.planeNormal);
    if (Math.abs(Math.abs(alignment) - 1) > 1e-9) {
      return super.offset(distance, normal);
    }
    const radius = this.radius + Math.sign(alignment) * distance;
    if (radius <= 0) {
      throw new RangeError('Offset distance collapses the arc.');
    }
    return new CircularArc(this.frame, radius, this.domain.start, this.domain.end);
  }

  override toNurbs(_tolerance?: number): NurbsCurve {
    return ellipticNurbs(this.frame, this.radius, this.radius, this.domain.start, this.domain.end);
  }

  protected jsonFields(): Record<string, unknown> {
    return { radius: this.radius };
  }
}

/**
 * Elliptical arc: `(a cos t, b sin t)` in the frame. `t` is the eccentric angle.
 * An arc spanning a full turn is an ellipse, and has the type name `Ellipse`.
 */
export class EllipticalArc extends FrameCurve {
  constructor(
    frame: Frame3,
    readonly radiusX: number,
    readonly radiusY: number,
    startAngle = 0,
    endAngle = TWO_PI,
  ) {
    super(frame, startAngle, endAngle);
    requirePositive(radiusX, 'Radius X');
    requirePositive(radiusY, 'Radius Y');
    if (endAngle - startAngle > TWO_PI + 1e-12) {
      throw new RangeError('An arc cannot span more than a full turn.');
    }
  }

  static ellipse(center: Vector3, radiusX: number, radiusY: number, normal: Vector3 = Vector3.Z, xAxis?: Vector3): EllipticalArc {
    return new EllipticalArc(Frame3.fromNormal(center, normal, xAxis), radiusX, radiusY);
  }

  private get isFullTurn(): boolean {
    return Math.abs(this.domain.end - this.domain.start - TWO_PI) <= 1e-12;
  }

  get type(): string {
    return this.isFullTurn ? 'Ellipse' : 'EllipticalArc';
  }

  override get isPeriodic(): boolean {
    return this.isFullTurn;
  }

  protected local(t: number, order: number): Vector3 {
    return new Vector3(this.radiusX * cosDerivative(1, t, order), this.radiusY * sinDerivative(1, t, order));
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): EllipticalArc {
    return new EllipticalArc(frame, this.radiusX * scale, this.radiusY * scale, start, end);
  }

  override enclosedArea(): number | undefined {
    return this.isFullTurn ? Math.PI * this.radiusX * this.radiusY : undefined;
  }

  override reversed(): EllipticalArc {
    return new EllipticalArc(this.frame.flippedY(), this.radiusX, this.radiusY, -this.domain.end, -this.domain.start);
  }

  override toNurbs(_tolerance?: number): NurbsCurve {
    return ellipticNurbs(this.frame, this.radiusX, this.radiusY, this.domain.start, this.domain.end);
  }

  protected jsonFields(): Record<string, unknown> {
    return { radiusX: this.radiusX, radiusY: this.radiusY };
  }
}

/**
 * Parabolic arc with its vertex at the frame origin, opening along +X:
 * `(t^2 / (4 f), t)`, where `f` is the focal length.
 */
export class ParabolicArc extends FrameCurve {
  readonly type = 'ParabolicArc';

  constructor(
    frame: Frame3,
    readonly focalLength: number,
    start: number,
    end: number,
  ) {
    super(frame, start, end);
    requirePositive(focalLength, 'Focal length');
  }

  override get degree(): number {
    return 2;
  }

  override get isClosed(): boolean {
    return false;
  }

  protected local(t: number, order: number): Vector3 {
    const f = this.focalLength;
    switch (order) {
      case 0:
        return new Vector3((t * t) / (4 * f), t);
      case 1:
        return new Vector3(t / (2 * f), 1);
      case 2:
        return new Vector3(1 / (2 * f), 0);
      default:
        return Vector3.ZERO;
    }
  }

  /** Lengths scale, and the parameter is a length, so the domain scales too. */
  protected rebuild(frame: Frame3, scale: number, start: number, end: number): ParabolicArc {
    return new ParabolicArc(frame, this.focalLength * scale, start * scale, end * scale);
  }

  override reversed(): ParabolicArc {
    return new ParabolicArc(this.frame.flippedY(), this.focalLength, -this.domain.end, -this.domain.start);
  }

  /** Exact and keeps the parameterization: a parabola is a polynomial quadratic. */
  override toNurbs(_tolerance?: number): NurbsCurve {
    const { start, end } = this.domain;
    const shoulder = this.evaluate(start).addScaled(this.evaluateDerivative(start, 1), (end - start) / 2);
    return new NurbsCurve(2, [this.evaluate(start), shoulder, this.evaluate(end)], [start, start, start, end, end, end]);
  }

  protected jsonFields(): Record<string, unknown> {
    return { focalLength: this.focalLength };
  }
}

/** One branch of a hyperbola, centred at the frame origin: `(a cosh t, b sinh t)`. */
export class HyperbolicArc extends FrameCurve {
  readonly type = 'HyperbolicArc';

  constructor(
    frame: Frame3,
    readonly semiMajor: number,
    readonly semiMinor: number,
    start: number,
    end: number,
  ) {
    super(frame, start, end);
    requirePositive(semiMajor, 'Semi-major axis');
    requirePositive(semiMinor, 'Semi-minor axis');
  }

  override get isClosed(): boolean {
    return false;
  }

  protected local(t: number, order: number): Vector3 {
    const even = order % 2 === 0;
    return new Vector3(
      this.semiMajor * (even ? Math.cosh(t) : Math.sinh(t)),
      this.semiMinor * (even ? Math.sinh(t) : Math.cosh(t)),
    );
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): HyperbolicArc {
    return new HyperbolicArc(frame, this.semiMajor * scale, this.semiMinor * scale, start, end);
  }

  override reversed(): HyperbolicArc {
    return new HyperbolicArc(this.frame.flippedY(), this.semiMajor, this.semiMinor, -this.domain.end, -this.domain.start);
  }

  /** Exact conic, as one rational quadratic piece. The parameterization differs. */
  override toNurbs(_tolerance?: number): NurbsCurve {
    const { start, end } = this.domain;
    const half = (end - start) / 2;
    const mid = (start + end) / 2;
    const shoulder = this.frame.toWorld(
      new Vector3((this.semiMajor * Math.cosh(mid)) / Math.cosh(half), (this.semiMinor * Math.sinh(mid)) / Math.cosh(half)),
    );
    return new NurbsCurve(
      2,
      [this.evaluate(start), shoulder, this.evaluate(end)],
      [start, start, start, end, end, end],
      [1, Math.cosh(half), 1],
    );
  }

  protected jsonFields(): Record<string, unknown> {
    return { semiMajor: this.semiMajor, semiMinor: this.semiMinor };
  }
}

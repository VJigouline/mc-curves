import { Frame3 } from '../math/Frame3.js';
import { clamp, cosDerivative, integrate, sinDerivative } from '../math/numeric.js';
import { Vector3 } from '../math/Vector3.js';
import { FrameCurve } from './FrameCurve.js';

function requirePositive(value: number, name: string): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be positive and finite.`);
  }
}

/** The `order`-th derivative of `r(t) f(t)` where `r` is linear, by the Leibniz rule. */
function linearTimesHarmonic(r: number, dr: number, f: (order: number) => number, order: number): number {
  return order === 0 ? r * f(0) : r * f(order) + order * dr * f(order - 1);
}

/**
 * Helix about the frame Z axis: `(r(t) cos t, r(t) sin t, pitch t / 2pi)`, with t in radians.
 * `taper` adds that much radius per turn, giving a conical helix. `leftHanded` reverses the winding.
 */
export class Helix extends FrameCurve {
  readonly type = 'Helix';

  constructor(
    frame: Frame3,
    readonly radius: number,
    readonly pitch: number,
    readonly turns: number,
    readonly options: { readonly leftHanded?: boolean; readonly taper?: number; readonly startTurn?: number } = {},
  ) {
    super(frame, (options.startTurn ?? 0) * 2 * Math.PI, ((options.startTurn ?? 0) + turns) * 2 * Math.PI);
    requirePositive(radius, 'Radius');
    requirePositive(turns, 'Turn count');
    if (!Number.isFinite(pitch)) {
      throw new RangeError('Pitch must be finite.');
    }
    const taper = options.taper ?? 0;
    const lowest = radius + (taper * this.domain.start) / (2 * Math.PI);
    const highest = radius + (taper * this.domain.end) / (2 * Math.PI);
    if (lowest < 0 || highest < 0) {
      throw new RangeError('Helix taper makes the radius negative.');
    }
  }

  private get taperPerRadian(): number {
    return (this.options.taper ?? 0) / (2 * Math.PI);
  }

  protected local(t: number, order: number): Vector3 {
    const dr = this.taperPerRadian;
    const r = this.radius + dr * t;
    const hand = this.options.leftHanded ? -1 : 1;
    const dz = this.pitch / (2 * Math.PI);
    return new Vector3(
      linearTimesHarmonic(r, dr, (k) => cosDerivative(1, t, k), order),
      hand * linearTimesHarmonic(r, dr, (k) => sinDerivative(1, t, k), order),
      order === 0 ? dz * t : order === 1 ? dz : 0,
    );
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): Helix {
    return new Helix(frame, this.radius * scale, this.pitch * scale, (end - start) / (2 * Math.PI), {
      ...this.options,
      taper: (this.options.taper ?? 0) * scale,
      startTurn: start / (2 * Math.PI),
    });
  }

  /** Zero pitch flattens the helix into a circle or, with a taper, a spiral. */
  override planeNormal(_tolerance?: number): Vector3 | undefined {
    return this.pitch === 0 ? this.frame.planeNormal : undefined;
  }

  override isPlanar(_tolerance?: number): boolean {
    return this.pitch === 0;
  }

  override lengthBetween(t0: number, t1: number): number {
    if (this.options.taper) {
      return super.lengthBetween(t0, t1);
    }
    const { start, end } = this.domain;
    const speed = Math.hypot(this.radius, this.pitch / (2 * Math.PI));
    return speed * Math.abs(clamp(t1, start, end) - clamp(t0, start, end));
  }

  protected jsonFields(): Record<string, unknown> {
    return { radius: this.radius, pitch: this.pitch, leftHanded: this.options.leftHanded ?? false, taper: this.options.taper ?? 0 };
  }
}

/** Archimedean spiral: `r = a + b t`, in polar coordinates in the frame. */
export class ArchimedeanSpiral extends FrameCurve {
  readonly type = 'ArchimedeanSpiral';

  constructor(
    frame: Frame3,
    readonly a: number,
    readonly b: number,
    start: number,
    end: number,
  ) {
    super(frame, start, end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
      throw new RangeError('Spiral coefficients must be finite, and b must not be zero.');
    }
  }

  override get isClosed(): boolean {
    return false;
  }

  protected local(t: number, order: number): Vector3 {
    const r = this.a + this.b * t;
    return new Vector3(
      linearTimesHarmonic(r, this.b, (k) => cosDerivative(1, t, k), order),
      linearTimesHarmonic(r, this.b, (k) => sinDerivative(1, t, k), order),
    );
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): ArchimedeanSpiral {
    return new ArchimedeanSpiral(frame, this.a * scale, this.b * scale, start, end);
  }

  protected jsonFields(): Record<string, unknown> {
    return { a: this.a, b: this.b };
  }
}

/** Logarithmic spiral: `r = a e^(b t)`, in polar coordinates in the frame. */
export class LogarithmicSpiral extends FrameCurve {
  readonly type = 'LogarithmicSpiral';

  constructor(
    frame: Frame3,
    readonly a: number,
    readonly b: number,
    start: number,
    end: number,
  ) {
    super(frame, start, end);
    requirePositive(a, 'Spiral coefficient a');
    if (!Number.isFinite(b) || b === 0) {
      throw new RangeError('Spiral coefficient b must be finite and not zero.');
    }
  }

  override get isClosed(): boolean {
    return false;
  }

  protected local(t: number, order: number): Vector3 {
    // Rotating (b, 1) gives the derivative of e^(b t) (cos t, sin t), so each order scales and turns.
    const scale = this.a * Math.exp(this.b * t) * Math.hypot(this.b, 1) ** order;
    const angle = t + order * Math.atan2(1, this.b);
    return new Vector3(scale * Math.cos(angle), scale * Math.sin(angle));
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): LogarithmicSpiral {
    return new LogarithmicSpiral(frame, this.a * scale, this.b, start, end);
  }

  override lengthBetween(t0: number, t1: number): number {
    const { start, end } = this.domain;
    const a = clamp(t0, start, end);
    const b = clamp(t1, start, end);
    return (this.a * Math.hypot(this.b, 1) * Math.abs(Math.exp(this.b * b) - Math.exp(this.b * a))) / Math.abs(this.b);
  }

  protected jsonFields(): Record<string, unknown> {
    return { a: this.a, b: this.b };
  }
}

/**
 * Involute of a circle of radius `baseRadius`, as used for gear teeth:
 * `r (cos t + t sin t, sin t - t cos t)`.
 */
export class InvoluteCurve extends FrameCurve {
  readonly type = 'InvoluteCurve';

  constructor(
    frame: Frame3,
    readonly baseRadius: number,
    start: number,
    end: number,
  ) {
    super(frame, start, end);
    requirePositive(baseRadius, 'Base radius');
  }

  override get isClosed(): boolean {
    return false;
  }

  protected local(t: number, order: number): Vector3 {
    const r = this.baseRadius;
    const cos = (k: number) => cosDerivative(1, t, k);
    const sin = (k: number) => sinDerivative(1, t, k);
    if (order === 0) {
      return new Vector3(r * (cos(0) + t * sin(0)), r * (sin(0) - t * cos(0)));
    }
    // The first derivative is r t (cos t, sin t); higher orders follow by the Leibniz rule.
    const k = order - 1;
    return new Vector3(r * linearTimesHarmonic(t, 1, cos, k), r * linearTimesHarmonic(t, 1, sin, k));
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): InvoluteCurve {
    return new InvoluteCurve(frame, this.baseRadius * scale, start, end);
  }

  /** Closed form on one side of the cusp at t = 0; the speed is `r |t|`. */
  override lengthBetween(t0: number, t1: number): number {
    const { start, end } = this.domain;
    const a = clamp(Math.min(t0, t1), start, end);
    const b = clamp(Math.max(t0, t1), start, end);
    const antiderivative = (t: number) => (t * Math.abs(t)) / 2;
    return this.baseRadius * (antiderivative(b) - antiderivative(a));
  }

  protected jsonFields(): Record<string, unknown> {
    return { baseRadius: this.baseRadius };
  }
}

/**
 * Clothoid (Euler spiral): a plane curve whose curvature changes linearly with arc length,
 * `k(s) = k0 + sharpness s`, as used for road and rail transitions. The parameter is arc length,
 * and `s = 0` sits at the frame origin with the heading `startHeading`.
 */
export class Clothoid extends FrameCurve {
  readonly type = 'Clothoid';

  constructor(
    frame: Frame3,
    readonly startCurvature: number,
    readonly sharpness: number,
    start: number,
    end: number,
    readonly startHeading = 0,
  ) {
    super(frame, start, end);
    if (!Number.isFinite(startCurvature) || !Number.isFinite(sharpness) || !Number.isFinite(startHeading)) {
      throw new RangeError('Clothoid coefficients must be finite.');
    }
  }

  /** The clothoid of the given length going from curvature `k0` to curvature `k1`. */
  static fromCurvatures(frame: Frame3, k0: number, k1: number, length: number): Clothoid {
    requirePositive(length, 'Length');
    return new Clothoid(frame, k0, (k1 - k0) / length, 0, length);
  }

  override get isClosed(): boolean {
    return false;
  }

  private heading(s: number): number {
    return this.startHeading + s * (this.startCurvature + (this.sharpness * s) / 2);
  }

  private curvatureAtLength(s: number): number {
    return this.startCurvature + this.sharpness * s;
  }

  /** Position by quadrature, on panels short enough for the heading to change slowly. */
  private position(s: number): Vector3 {
    if (s === 0) {
      return Vector3.ZERO;
    }
    const maxCurvature = Math.max(Math.abs(this.curvatureAtLength(0)), Math.abs(this.curvatureAtLength(s)));
    const panels = Math.max(Math.ceil(Math.abs(s) * maxCurvature), 1);
    let x = 0;
    let y = 0;
    for (let i = 0; i < panels; i++) {
      const lo = (s * i) / panels;
      const hi = (s * (i + 1)) / panels;
      x += integrate((u) => Math.cos(this.heading(u)), lo, hi, 1e-13, 12);
      y += integrate((u) => Math.sin(this.heading(u)), lo, hi, 1e-13, 12);
    }
    return new Vector3(x, y);
  }

  protected local(s: number, order: number): Vector3 {
    if (order === 0) {
      return this.position(s);
    }
    const h = this.heading(s);
    const k = this.curvatureAtLength(s);
    const c = Math.cos(h);
    const n = Math.sin(h);
    switch (order) {
      case 1:
        return new Vector3(c, n);
      case 2:
        return new Vector3(-k * n, k * c);
      case 3:
        return new Vector3(-this.sharpness * n - k * k * c, this.sharpness * c - k * k * n);
      default:
        throw new RangeError('Clothoid supports derivatives up to order 3.');
    }
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): Clothoid {
    return new Clothoid(
      frame,
      this.startCurvature / scale,
      this.sharpness / (scale * scale),
      start * scale,
      end * scale,
      this.startHeading,
    );
  }

  override lengthBetween(t0: number, t1: number): number {
    const { start, end } = this.domain;
    return Math.abs(clamp(t1, start, end) - clamp(t0, start, end));
  }

  override parameterAtLength(s: number): number {
    return this.domain.start + clamp(s, 0, this.length);
  }

  override curvatureAt(s: number): number {
    return Math.abs(this.curvatureAtLength(this.normalizeParameter(s)));
  }

  protected jsonFields(): Record<string, unknown> {
    return { startCurvature: this.startCurvature, sharpness: this.sharpness, startHeading: this.startHeading };
  }
}

import { Frame3 } from '../math/Frame3.js';
import { cosDerivative, sinDerivative } from '../math/numeric.js';
import { Vector3 } from '../math/Vector3.js';
import { FrameCurve } from './FrameCurve.js';

function requirePositive(value: number, name: string): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be positive and finite.`);
  }
}

/**
 * Trochoid: traced by a point at distance `d` from the centre of a circle of radius `r`
 * rolling along the X axis: `(r t - d sin t, r - d cos t)`. With `d = r` it is a cycloid.
 */
export class Trochoid extends FrameCurve {
  readonly type = 'Trochoid';

  constructor(
    frame: Frame3,
    readonly rollingRadius: number,
    readonly penDistance: number,
    start: number,
    end: number,
  ) {
    super(frame, start, end);
    requirePositive(rollingRadius, 'Rolling radius');
    requirePositive(penDistance, 'Pen distance');
  }

  static cycloid(frame: Frame3, radius: number, arches = 1): Trochoid {
    return new Trochoid(frame, radius, radius, 0, arches * 2 * Math.PI);
  }

  protected local(t: number, order: number): Vector3 {
    const r = this.rollingRadius;
    const d = this.penDistance;
    const linearX = order === 0 ? r * t : order === 1 ? r : 0;
    const constantY = order === 0 ? r : 0;
    return new Vector3(linearX - d * sinDerivative(1, t, order), constantY - d * cosDerivative(1, t, order));
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): Trochoid {
    return new Trochoid(frame, this.rollingRadius * scale, this.penDistance * scale, start, end);
  }

  protected jsonFields(): Record<string, unknown> {
    return { rollingRadius: this.rollingRadius, penDistance: this.penDistance };
  }
}

/**
 * Epitrochoid: a circle of radius `r` rolling outside a fixed circle of radius `R`.
 * With `d = r` it is an epicycloid, as used for cycloidal gears and Wankel housings.
 */
export class Epitrochoid extends FrameCurve {
  readonly type = 'Epitrochoid';

  constructor(
    frame: Frame3,
    readonly fixedRadius: number,
    readonly rollingRadius: number,
    readonly penDistance: number,
    start = 0,
    end = 2 * Math.PI,
  ) {
    super(frame, start, end);
    requirePositive(fixedRadius, 'Fixed radius');
    requirePositive(rollingRadius, 'Rolling radius');
    requirePositive(penDistance, 'Pen distance');
  }

  protected local(t: number, order: number): Vector3 {
    const sum = this.fixedRadius + this.rollingRadius;
    const w = sum / this.rollingRadius;
    const d = this.penDistance;
    return new Vector3(
      sum * cosDerivative(1, t, order) - d * cosDerivative(w, t, order),
      sum * sinDerivative(1, t, order) - d * sinDerivative(w, t, order),
    );
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): Epitrochoid {
    return new Epitrochoid(frame, this.fixedRadius * scale, this.rollingRadius * scale, this.penDistance * scale, start, end);
  }

  protected jsonFields(): Record<string, unknown> {
    return { fixedRadius: this.fixedRadius, rollingRadius: this.rollingRadius, penDistance: this.penDistance };
  }
}

/** Hypotrochoid: a circle of radius `r` rolling inside a fixed circle of radius `R`. */
export class Hypotrochoid extends FrameCurve {
  readonly type = 'Hypotrochoid';

  constructor(
    frame: Frame3,
    readonly fixedRadius: number,
    readonly rollingRadius: number,
    readonly penDistance: number,
    start = 0,
    end = 2 * Math.PI,
  ) {
    super(frame, start, end);
    requirePositive(fixedRadius, 'Fixed radius');
    requirePositive(rollingRadius, 'Rolling radius');
    requirePositive(penDistance, 'Pen distance');
    if (rollingRadius === fixedRadius) {
      throw new RangeError('The rolling radius must differ from the fixed radius.');
    }
  }

  protected local(t: number, order: number): Vector3 {
    const difference = this.fixedRadius - this.rollingRadius;
    const w = difference / this.rollingRadius;
    const d = this.penDistance;
    return new Vector3(
      difference * cosDerivative(1, t, order) + d * cosDerivative(w, t, order),
      difference * sinDerivative(1, t, order) - d * sinDerivative(w, t, order),
    );
  }

  protected rebuild(frame: Frame3, scale: number, start: number, end: number): Hypotrochoid {
    return new Hypotrochoid(frame, this.fixedRadius * scale, this.rollingRadius * scale, this.penDistance * scale, start, end);
  }

  protected jsonFields(): Record<string, unknown> {
    return { fixedRadius: this.fixedRadius, rollingRadius: this.rollingRadius, penDistance: this.penDistance };
  }
}

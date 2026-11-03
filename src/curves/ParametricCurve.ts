import type { Vector3 } from '../math/Vector3.js';
import { CurveBase } from './CurveBase.js';
import type { CurveDomain, CurveJSON } from './ICurve.js';

export interface ParametricCurveOptions {
  /** Derivative function. Without it, or when it returns `undefined`, derivatives are numeric. */
  readonly derivative?: (t: number, order: number) => Vector3 | undefined;
  /** Parameters where the function is not smooth. Numeric methods do not cross these. */
  readonly breakpoints?: readonly number[];
  readonly periodic?: boolean;
}

/**
 * Curve from any function of the parameter, for shapes this library has no class for.
 * It gets every `ICurve` method, but cannot be written to JSON, since a function has no JSON form.
 */
export class ParametricCurve extends CurveBase {
  readonly type = 'ParametricCurve';
  readonly domain: CurveDomain;

  constructor(
    private readonly fn: (t: number) => Vector3,
    start: number,
    end: number,
    private readonly options: ParametricCurveOptions = {},
  ) {
    super();
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) {
      throw new RangeError('Curve domain must be finite and of positive size.');
    }
    this.domain = { start, end };
  }

  override get isPeriodic(): boolean {
    return this.options.periodic ?? false;
  }

  protected evaluate(t: number): Vector3 {
    return this.fn(t);
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    return this.options.derivative?.(t, order) ?? super.evaluateDerivative(t, order);
  }

  override breakpoints(): number[] {
    const { start, end } = this.domain;
    const inner = (this.options.breakpoints ?? []).filter((b) => b > start && b < end);
    return [start, ...[...inner].sort((a, b) => a - b), end];
  }

  toJSON(): CurveJSON {
    throw new TypeError('ParametricCurve holds a function, so it cannot be written to JSON. Use toNurbs() first.');
  }
}

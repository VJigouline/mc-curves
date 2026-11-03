import { GEOMETRIC_TOLERANCE } from '../math/numeric.js';
import type { Transform3 } from '../math/Transform3.js';
import type { Vector3 } from '../math/Vector3.js';
import { CurveBase } from './CurveBase.js';
import type { CurveDomain, CurveJSON, ICurve } from './ICurve.js';

/**
 * Connected chain of curves. Each piece keeps its parameter speed: the composite domain is
 * [0, sum of piece domain sizes], so derivatives equal those of the pieces.
 */
export class CompositeCurve extends CurveBase {
  readonly type = 'CompositeCurve';
  readonly domain: CurveDomain;
  readonly curves: readonly ICurve[];
  /** Composite parameter at the start of each piece, plus the domain end. */
  private readonly offsets: readonly number[];

  constructor(curves: readonly ICurve[], tolerance = 1e-7) {
    super();
    if (curves.length === 0) {
      throw new RangeError('A composite curve needs at least one piece.');
    }
    for (let i = 0; i + 1 < curves.length; i++) {
      const gap = curves[i]!.endPoint.distanceTo(curves[i + 1]!.startPoint);
      if (gap > tolerance) {
        throw new RangeError(`Pieces ${i} and ${i + 1} are ${gap} apart.`);
      }
    }
    this.curves = [...curves];
    const offsets = [0];
    for (const c of curves) {
      offsets.push(offsets[offsets.length - 1]! + c.domain.end - c.domain.start);
    }
    this.offsets = offsets;
    this.domain = { start: 0, end: offsets[offsets.length - 1]! };
  }

  /**
   * Orders and flips unordered pieces into one chain, starting from the first piece.
   * Throws if a piece does not fit.
   */
  static connect(curves: readonly ICurve[], tolerance = 1e-7): CompositeCurve {
    if (curves.length === 0) {
      throw new RangeError('A composite curve needs at least one piece.');
    }
    const chain = [curves[0]!];
    const remaining = curves.slice(1);
    while (remaining.length > 0) {
      const head = chain[0]!.startPoint;
      const tail = chain[chain.length - 1]!.endPoint;
      const index = remaining.findIndex(
        (c) =>
          c.startPoint.distanceTo(tail) <= tolerance ||
          c.endPoint.distanceTo(tail) <= tolerance ||
          c.startPoint.distanceTo(head) <= tolerance ||
          c.endPoint.distanceTo(head) <= tolerance,
      );
      if (index < 0) {
        throw new RangeError('The remaining pieces do not connect to the chain.');
      }
      const c = remaining.splice(index, 1)[0]!;
      if (c.startPoint.distanceTo(tail) <= tolerance) {
        chain.push(c);
      } else if (c.endPoint.distanceTo(tail) <= tolerance) {
        chain.push(c.reversed());
      } else if (c.endPoint.distanceTo(head) <= tolerance) {
        chain.unshift(c);
      } else {
        chain.unshift(c.reversed());
      }
    }
    return new CompositeCurve(chain, tolerance);
  }

  override get isClosed(): boolean {
    return this.startPoint.distanceTo(this.endPoint) <= Math.max(GEOMETRIC_TOLERANCE, 1e-7);
  }

  /** The piece holding `t`, and the matching parameter on that piece. */
  private locate(t: number): { index: number; local: number } {
    let index = this.curves.length - 1;
    for (let i = 0; i < this.curves.length; i++) {
      if (t < this.offsets[i + 1]!) {
        index = i;
        break;
      }
    }
    return { index, local: this.curves[index]!.domain.start + t - this.offsets[index]! };
  }

  protected evaluate(t: number): Vector3 {
    const { index, local } = this.locate(t);
    return this.curves[index]!.pointAt(local);
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    const { index, local } = this.locate(t);
    return this.curves[index]!.derivativeAt(local, order);
  }

  override breakpoints(): number[] {
    const result = [0];
    this.curves.forEach((c, i) => {
      const shift = this.offsets[i]! - c.domain.start;
      for (const b of c.breakpoints().slice(1)) {
        result.push(b + shift);
      }
    });
    return result;
  }

  override trim(t0: number, t1: number): ICurve {
    const [a, b] = this.checkedTrimRange(t0, t1);
    const pieces: ICurve[] = [];
    this.curves.forEach((c, i) => {
      const lo = Math.max(a, this.offsets[i]!);
      const hi = Math.min(b, this.offsets[i + 1]!);
      if (hi > lo) {
        const shift = c.domain.start - this.offsets[i]!;
        const whole = lo === this.offsets[i] && hi === this.offsets[i + 1];
        pieces.push(whole ? c : c.trim(lo + shift, hi + shift));
      }
    });
    return new CompositeCurve(pieces);
  }

  override reversed(): CompositeCurve {
    return new CompositeCurve([...this.curves].reverse().map((c) => c.reversed()));
  }

  override transformed(transform: Transform3): CompositeCurve {
    return new CompositeCurve(this.curves.map((c) => c.transformed(transform)));
  }

  toJSON(): CurveJSON {
    return { type: this.type, curves: this.curves.map((c) => c.toJSON()) };
  }
}

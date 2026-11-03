import { Frame3 } from '../math/Frame3.js';
import type { Transform3 } from '../math/Transform3.js';
import { Vector3 } from '../math/Vector3.js';
import { CurveBase, TransformedCurve } from './CurveBase.js';
import type { CurveDomain, CurveJSON, ICurve } from './ICurve.js';

/**
 * Curve defined in closed form in a local coordinate system.
 * Similarity transforms stay exact by moving the frame and scaling the size parameters;
 * other affine transforms fall back to `TransformedCurve`.
 */
export abstract class FrameCurve extends CurveBase {
  readonly domain: CurveDomain;

  constructor(
    readonly frame: Frame3,
    start: number,
    end: number,
  ) {
    super();
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) {
      throw new RangeError('Curve domain must be finite and of positive size.');
    }
    this.domain = { start, end };
  }

  /** Point (`order` 0) or derivative in local coordinates. */
  protected abstract local(t: number, order: number): Vector3;

  /** The same kind of curve in a new frame, with sizes multiplied by `scale`, over [start, end]. */
  protected abstract rebuild(frame: Frame3, scale: number, start: number, end: number): FrameCurve;

  /** Curve-specific members of the JSON form. */
  protected abstract jsonFields(): Record<string, unknown>;

  protected evaluate(t: number): Vector3 {
    return this.frame.toWorld(this.local(t, 0));
  }

  protected override evaluateDerivative(t: number, order: number): Vector3 {
    return this.frame.vectorToWorld(this.local(t, order));
  }

  /** The direction the curve's plane faces. Non-planar subclasses override this. */
  override planeNormal(_tolerance?: number): Vector3 | undefined {
    return this.frame.planeNormal;
  }

  override trim(t0: number, t1: number): ICurve {
    const [a, b] = this.checkedTrimRange(t0, t1);
    return this.rebuild(this.frame, 1, a, b);
  }

  override transformed(transform: Transform3): ICurve {
    const scale = transform.similarityScale();
    if (scale === undefined) {
      return new TransformedCurve(this, transform);
    }
    return this.rebuild(this.frame.transformed(transform), scale, this.domain.start, this.domain.end);
  }

  toJSON(): CurveJSON {
    return {
      type: this.type,
      frame: this.frame.toJSON(),
      start: this.domain.start,
      end: this.domain.end,
      ...this.jsonFields(),
    };
  }
}

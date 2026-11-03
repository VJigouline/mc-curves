import { Vector3 } from './Vector3.js';

/**
 * Immutable affine transform: `p' = L * p + t`, with `L` a 3x3 matrix stored by rows.
 */
export class Transform3 {
  static readonly IDENTITY = new Transform3([1, 0, 0, 0, 1, 0, 0, 0, 1], Vector3.ZERO);

  constructor(
    readonly linear: readonly number[],
    readonly translation: Vector3,
  ) {
    if (linear.length !== 9) {
      throw new RangeError('Transform3 needs a linear part of 9 numbers.');
    }
  }

  static translate(v: Vector3): Transform3 {
    return new Transform3(Transform3.IDENTITY.linear, v);
  }

  /** Non-uniform scale about `origin`. */
  static scale(sx: number, sy: number = sx, sz: number = sx, origin: Vector3 = Vector3.ZERO): Transform3 {
    return Transform3.about([sx, 0, 0, 0, sy, 0, 0, 0, sz], origin);
  }

  /** Right-handed rotation of `angle` radians about the axis through `origin`. */
  static rotate(axis: Vector3, angle: number, origin: Vector3 = Vector3.ZERO): Transform3 {
    const a = axis.normalized();
    if (a.lengthSquared === 0) {
      throw new RangeError('Rotation axis must not be zero.');
    }
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const k = 1 - c;
    return Transform3.about(
      [
        c + a.x * a.x * k, a.x * a.y * k - a.z * s, a.x * a.z * k + a.y * s,
        a.y * a.x * k + a.z * s, c + a.y * a.y * k, a.y * a.z * k - a.x * s,
        a.z * a.x * k - a.y * s, a.z * a.y * k + a.x * s, c + a.z * a.z * k,
      ],
      origin,
    );
  }

  /** Reflection in the plane through `origin` with the given normal. */
  static mirror(normal: Vector3, origin: Vector3 = Vector3.ZERO): Transform3 {
    const n = normal.normalized();
    if (n.lengthSquared === 0) {
      throw new RangeError('Mirror normal must not be zero.');
    }
    return Transform3.about(
      [
        1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z,
        -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z,
        -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z,
      ],
      origin,
    );
  }

  private static about(linear: number[], origin: Vector3): Transform3 {
    const noTranslation = new Transform3(linear, Vector3.ZERO);
    return new Transform3(linear, origin.sub(noTranslation.applyToVector(origin)));
  }

  applyToPoint(p: Vector3): Vector3 {
    return this.applyToVector(p).add(this.translation);
  }

  /** Applies only the linear part, as is right for derivatives and directions. */
  applyToVector(v: Vector3): Vector3 {
    const m = this.linear;
    return new Vector3(
      m[0]! * v.x + m[1]! * v.y + m[2]! * v.z,
      m[3]! * v.x + m[4]! * v.y + m[5]! * v.z,
      m[6]! * v.x + m[7]! * v.y + m[8]! * v.z,
    );
  }

  /** Returns the transform that applies `first`, then this one. */
  compose(first: Transform3): Transform3 {
    const a = this.linear;
    const b = first.linear;
    const linear: number[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        linear.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[c + 3]! + a[r * 3 + 2]! * b[c + 6]!);
      }
    }
    return new Transform3(linear, this.applyToPoint(first.translation));
  }

  /**
   * The uniform scale factor if this transform is a similarity (rotation, reflection, translation
   * and uniform scale), otherwise `undefined`. Similarities map circles to circles.
   */
  similarityScale(tolerance = 1e-10): number | undefined {
    const cx = this.applyToVector(Vector3.X);
    const cy = this.applyToVector(Vector3.Y);
    const cz = this.applyToVector(Vector3.Z);
    const s = cx.length;
    if (s === 0) {
      return undefined;
    }
    const limit = tolerance * s * s;
    const similar =
      Math.abs(cy.lengthSquared - s * s) <= limit &&
      Math.abs(cz.lengthSquared - s * s) <= limit &&
      Math.abs(cx.dot(cy)) <= limit &&
      Math.abs(cx.dot(cz)) <= limit &&
      Math.abs(cy.dot(cz)) <= limit;
    return similar ? s : undefined;
  }
}

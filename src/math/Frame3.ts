import type { Transform3 } from './Transform3.js';
import { Vector3 } from './Vector3.js';

/**
 * Orthonormal local coordinate system. Planar curves live in its XY plane.
 * A frame produced by a mirror transform is left-handed, which is why `zAxis` is stored
 * rather than derived. Use `planeNormal` for the direction that local counter-clockwise
 * motion rotates about.
 */
export class Frame3 {
  static readonly WORLD = new Frame3(Vector3.ZERO, Vector3.X, Vector3.Y, Vector3.Z);

  private constructor(
    readonly origin: Vector3,
    readonly xAxis: Vector3,
    readonly yAxis: Vector3,
    readonly zAxis: Vector3,
  ) {}

  /**
   * Builds a right-handed frame from a Z direction and an optional hint for the X direction.
   * The hint is projected on the plane; it must not be parallel to the normal.
   */
  static fromNormal(origin: Vector3, normal: Vector3 = Vector3.Z, xHint?: Vector3): Frame3 {
    const z = normal.normalized();
    if (z.lengthSquared === 0) {
      throw new RangeError('Frame normal must not be zero.');
    }
    let x = xHint ? xHint.sub(z.scale(xHint.dot(z))) : z.anyPerpendicular();
    if (xHint && x.length <= 1e-12 * xHint.length) {
      throw new RangeError('Frame X direction must not be parallel to the normal.');
    }
    if (!xHint && Math.abs(z.dot(Vector3.Z)) > 1 - 1e-12) {
      x = Vector3.X;
    }
    x = x.normalized();
    return new Frame3(origin, x, z.cross(x).normalized(), z);
  }

  /** Rebuilds a frame stored as raw axes, such as one read from JSON. */
  static fromAxes(origin: Vector3, xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): Frame3 {
    return new Frame3(origin, xAxis, yAxis, zAxis);
  }

  /** The direction local counter-clockwise motion rotates about: X cross Y. */
  get planeNormal(): Vector3 {
    return this.xAxis.cross(this.yAxis);
  }

  toWorld(local: Vector3): Vector3 {
    return this.vectorToWorld(local).add(this.origin);
  }

  vectorToWorld(local: Vector3): Vector3 {
    return this.xAxis.scale(local.x).addScaled(this.yAxis, local.y).addScaled(this.zAxis, local.z);
  }

  toLocal(world: Vector3): Vector3 {
    const d = world.sub(this.origin);
    return new Vector3(d.dot(this.xAxis), d.dot(this.yAxis), d.dot(this.zAxis));
  }

  /** Applies a similarity transform; the axes are renormalized, so the scale is dropped. */
  transformed(t: Transform3): Frame3 {
    return new Frame3(
      t.applyToPoint(this.origin),
      t.applyToVector(this.xAxis).normalized(),
      t.applyToVector(this.yAxis).normalized(),
      t.applyToVector(this.zAxis).normalized(),
    );
  }

  /** Same plane and X axis, with Y and Z flipped. Local angles run the other way. */
  flippedY(): Frame3 {
    return new Frame3(this.origin, this.xAxis, this.yAxis.negate(), this.zAxis.negate());
  }

  toJSON(): { origin: number[]; x: number[]; y: number[]; z: number[] } {
    return {
      origin: this.origin.toArray(),
      x: this.xAxis.toArray(),
      y: this.yAxis.toArray(),
      z: this.zAxis.toArray(),
    };
  }
}

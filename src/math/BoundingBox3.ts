import { Vector3 } from './Vector3.js';

/** Immutable axis-aligned bounding box. */
export class BoundingBox3 {
  constructor(
    readonly min: Vector3,
    readonly max: Vector3,
  ) {}

  static fromPoints(points: readonly Vector3[]): BoundingBox3 {
    if (points.length === 0) {
      throw new RangeError('A bounding box needs at least one point.');
    }
    let [minX, minY, minZ] = [Infinity, Infinity, Infinity];
    let [maxX, maxY, maxZ] = [-Infinity, -Infinity, -Infinity];
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      maxZ = Math.max(maxZ, p.z);
    }
    return new BoundingBox3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ));
  }

  get size(): Vector3 {
    return this.max.sub(this.min);
  }

  get center(): Vector3 {
    return this.min.lerp(this.max, 0.5);
  }

  get diagonal(): number {
    return this.size.length;
  }

  contains(p: Vector3, tolerance = 0): boolean {
    return (
      p.x >= this.min.x - tolerance && p.x <= this.max.x + tolerance &&
      p.y >= this.min.y - tolerance && p.y <= this.max.y + tolerance &&
      p.z >= this.min.z - tolerance && p.z <= this.max.z + tolerance
    );
  }

  intersects(o: BoundingBox3, tolerance = 0): boolean {
    return (
      this.min.x <= o.max.x + tolerance && this.max.x >= o.min.x - tolerance &&
      this.min.y <= o.max.y + tolerance && this.max.y >= o.min.y - tolerance &&
      this.min.z <= o.max.z + tolerance && this.max.z >= o.min.z - tolerance
    );
  }
}

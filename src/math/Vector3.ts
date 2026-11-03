/** Immutable 3D vector. Points and directions share this type. */
export class Vector3 {
  static readonly ZERO = new Vector3(0, 0, 0);
  static readonly X = new Vector3(1, 0, 0);
  static readonly Y = new Vector3(0, 1, 0);
  static readonly Z = new Vector3(0, 0, 1);

  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number = 0,
  ) {}

  static fromArray(a: readonly number[]): Vector3 {
    return new Vector3(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0);
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  add(o: Vector3): Vector3 {
    return new Vector3(this.x + o.x, this.y + o.y, this.z + o.z);
  }

  sub(o: Vector3): Vector3 {
    return new Vector3(this.x - o.x, this.y - o.y, this.z - o.z);
  }

  scale(s: number): Vector3 {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }

  /** Returns `this + o * s`. */
  addScaled(o: Vector3, s: number): Vector3 {
    return new Vector3(this.x + o.x * s, this.y + o.y * s, this.z + o.z * s);
  }

  negate(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  dot(o: Vector3): number {
    return this.x * o.x + this.y * o.y + this.z * o.z;
  }

  cross(o: Vector3): Vector3 {
    return new Vector3(
      this.y * o.z - this.z * o.y,
      this.z * o.x - this.x * o.z,
      this.x * o.y - this.y * o.x,
    );
  }

  get lengthSquared(): number {
    return this.dot(this);
  }

  get length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  /** Unit vector in the same direction. The zero vector stays zero. */
  normalized(): Vector3 {
    const l = this.length;
    return l === 0 ? this : this.scale(1 / l);
  }

  distanceTo(o: Vector3): number {
    return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z);
  }

  lerp(o: Vector3, s: number): Vector3 {
    return new Vector3(
      this.x + (o.x - this.x) * s,
      this.y + (o.y - this.y) * s,
      this.z + (o.z - this.z) * s,
    );
  }

  /** A deterministic unit vector perpendicular to this one. */
  anyPerpendicular(): Vector3 {
    const ax = Math.abs(this.x);
    const ay = Math.abs(this.y);
    const az = Math.abs(this.z);
    const helper = ax <= ay && ax <= az ? Vector3.X : ay <= az ? Vector3.Y : Vector3.Z;
    return this.cross(helper).normalized();
  }

  equals(o: Vector3, tolerance = 1e-9): boolean {
    return this.distanceTo(o) <= tolerance;
  }

  get isFinite(): boolean {
    return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z);
  }
}

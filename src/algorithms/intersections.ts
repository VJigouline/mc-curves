import type { CurveIntersection, ICurve, PlaneIntersection } from '../curves/ICurve.js';
import { BoundingBox3 } from '../math/BoundingBox3.js';
import { bisect, clamp } from '../math/numeric.js';
import type { Vector3 } from '../math/Vector3.js';

/** Most candidate pairs refined per call. Bounds the cost for overlapping curves. */
const MAX_CANDIDATES = 2000;

/** Closest parameters (0..1) between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection). */
function closestOnSegments(p1: Vector3, q1: Vector3, p2: Vector3, q2: Vector3): { s: number; u: number; distance: number } {
  const d1 = q1.sub(p1);
  const d2 = q2.sub(p2);
  const r = p1.sub(p2);
  const a = d1.lengthSquared;
  const e = d2.lengthSquared;
  const f = d2.dot(r);
  let s = 0;
  let u = 0;
  if (a > 0 && e > 0) {
    const c = d1.dot(r);
    const b = d1.dot(d2);
    const denom = a * e - b * b;
    s = denom > 1e-14 * a * e ? clamp((b * f - c * e) / denom, 0, 1) : 0;
    u = (b * s + f) / e;
    if (u < 0) {
      u = 0;
      s = clamp(-c / a, 0, 1);
    } else if (u > 1) {
      u = 1;
      s = clamp((b - c) / a, 0, 1);
    }
  } else if (a > 0) {
    s = clamp(-d1.dot(r) / a, 0, 1);
  } else if (e > 0) {
    u = clamp(f / e, 0, 1);
  }
  return { s, u, distance: p1.lerp(q1, s).distanceTo(p2.lerp(q2, u)) };
}

/** Gauss-Newton minimization of `|a(t) - b(u)|`, keeping both parameters in their domains. */
function refine(a: ICurve, b: ICurve, t0: number, u0: number): { t: number; u: number; distance: number } {
  let t = t0;
  let u = u0;
  const clampT = (v: number) => clamp(v, a.domain.start, a.domain.end);
  const clampU = (v: number) => clamp(v, b.domain.start, b.domain.end);
  for (let i = 0; i < 30; i++) {
    const r = a.pointAt(t).sub(b.pointAt(u));
    const da = a.derivativeAt(t);
    const db = b.derivativeAt(u);
    const aa = da.dot(da);
    const ab = da.dot(db);
    const bb = db.dot(db);
    const ra = r.dot(da);
    const rb = r.dot(db);
    let dt: number;
    let du: number;
    const det = aa * bb - ab * ab;
    if (Math.abs(det) > 1e-12 * aa * bb) {
      dt = (-ra * bb + rb * ab) / det;
      du = (-ra * ab + rb * aa) / det;
    } else {
      // Parallel tangents: the system is singular, so step each parameter on its own.
      dt = aa > 0 ? -ra / aa : 0;
      du = bb > 0 ? rb / bb : 0;
    }
    const nextT = clampT(t + dt);
    const nextU = clampU(u + du);
    const moved = Math.abs(nextT - t) + Math.abs(nextU - u);
    t = nextT;
    u = nextU;
    if (moved < 1e-14) {
      break;
    }
  }
  return { t, u, distance: a.pointAt(t).distanceTo(b.pointAt(u)) };
}

export function intersectCurves(a: ICurve, b: ICurve, tolerance = 1e-6): CurveIntersection[] {
  const boxA = a.boundingBox();
  const boxB = b.boundingBox();
  if (!boxA.intersects(boxB, tolerance)) {
    return [];
  }
  const scale = Math.max(Math.min(boxA.diagonal, boxB.diagonal), tolerance);
  const chord = scale / 400;
  const ta = a.tessellate({ chordTolerance: chord });
  const tb = b.tessellate({ chordTolerance: chord });
  const reach = 4 * chord + tolerance;

  const candidates: { t: number; u: number; gap: number }[] = [];
  for (let i = 0; i + 1 < ta.points.length; i++) {
    const p1 = ta.points[i]!;
    const q1 = ta.points[i + 1]!;
    const segBox = BoundingBox3.fromPoints([p1, q1]);
    if (!segBox.intersects(boxB, reach)) {
      continue;
    }
    for (let j = 0; j + 1 < tb.points.length; j++) {
      const p2 = tb.points[j]!;
      const q2 = tb.points[j + 1]!;
      if (!segBox.intersects(BoundingBox3.fromPoints([p2, q2]), reach)) {
        continue;
      }
      const c = closestOnSegments(p1, q1, p2, q2);
      if (c.distance <= reach) {
        const t0 = ta.parameters[i]!;
        const t1 = ta.parameters[i + 1]!;
        const u0 = tb.parameters[j]!;
        const u1 = tb.parameters[j + 1]!;
        candidates.push({ t: t0 + (t1 - t0) * c.s, u: u0 + (u1 - u0) * c.u, gap: c.distance });
      }
    }
  }
  candidates.sort((x, y) => x.gap - y.gap);

  const merge = Math.max(10 * tolerance, 1e-3 * scale);
  const results: CurveIntersection[] = [];
  for (const c of candidates.slice(0, MAX_CANDIDATES)) {
    const r = refine(a, b, c.t, c.u);
    if (r.distance > tolerance) {
      continue;
    }
    const point = a.pointAt(r.t);
    if (!results.some((x) => x.point.distanceTo(point) <= merge)) {
      results.push({ point, parameterA: r.t, parameterB: r.u, distance: r.distance });
    }
  }
  return results.sort((x, y) => x.parameterA - y.parameterA);
}

export function intersectPlane(curve: ICurve, origin: Vector3, normal: Vector3): PlaneIntersection[] {
  const n = normal.normalized();
  if (n.lengthSquared === 0) {
    throw new RangeError('Plane normal must not be zero.');
  }
  const height = (t: number) => curve.pointAt(t).sub(origin).dot(n);
  const scale = curve.boundingBox().diagonal;
  const { parameters } = curve.tessellate({ chordTolerance: Math.max(scale / 1000, 1e-9) });
  const zero = 1e-12 * Math.max(scale, 1);
  const results: PlaneIntersection[] = [];
  const add = (t: number) => {
    const point = curve.pointAt(t);
    if (!results.some((r) => r.point.distanceTo(point) <= 1e-9 * Math.max(scale, 1))) {
      results.push({ point, parameter: t });
    }
  };
  let previous = parameters[0]!;
  let hPrevious = height(previous);
  if (Math.abs(hPrevious) <= zero) {
    add(previous);
  }
  for (let i = 1; i < parameters.length; i++) {
    const current = parameters[i]!;
    const h = height(current);
    if (Math.abs(h) <= zero) {
      add(current);
    } else if (Math.abs(hPrevious) > zero && hPrevious < 0 !== h < 0) {
      add(bisect(height, previous, current));
    }
    previous = current;
    hPrevious = h;
  }
  return results;
}

import type { Vector3 } from './Vector3.js';

/** Distance below which two points count as coincident. */
export const GEOMETRIC_TOLERANCE = 1e-9;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Eight-point Gauss-Legendre rule on [-1, 1].
const GL_NODES = [0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const GL_WEIGHTS = [0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

function gauss8(f: (x: number) => number, a: number, b: number): number {
  const mid = (a + b) / 2;
  const half = (b - a) / 2;
  let sum = 0;
  for (let i = 0; i < GL_NODES.length; i++) {
    const dx = half * GL_NODES[i]!;
    sum += GL_WEIGHTS[i]! * (f(mid - dx) + f(mid + dx));
  }
  return sum * half;
}

/** Adaptive Gauss-Legendre integration of `f` over [a, b]. */
export function integrate(f: (x: number) => number, a: number, b: number, tolerance = 1e-10, maxDepth = 24): number {
  const refine = (lo: number, hi: number, whole: number, tol: number, depth: number): number => {
    const mid = (lo + hi) / 2;
    const left = gauss8(f, lo, mid);
    const right = gauss8(f, mid, hi);
    const sum = left + right;
    // Below this fraction of the sum, the error estimate is only noise from rounding or from
    // numeric derivatives: refining further would never satisfy an absolute tolerance on a large model.
    if (depth <= 0 || Math.abs(sum - whole) <= Math.max(tol, 1e-12 * Math.abs(sum))) {
      return sum;
    }
    return refine(lo, mid, left, tol / 2, depth - 1) + refine(mid, hi, right, tol / 2, depth - 1);
  };
  return refine(a, b, gauss8(f, a, b), tolerance, maxDepth);
}

/** Bisection root of `f` on [a, b]. The ends must have opposite signs, or one must be a root. */
export function bisect(f: (x: number) => number, a: number, b: number, iterations = 60): number {
  let lo = a;
  let hi = b;
  let fLo = f(lo);
  if (fLo === 0) {
    return lo;
  }
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (fMid === 0) {
      return mid;
    }
    if (fLo < 0 === fMid < 0) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** Golden-section minimum of a unimodal `f` on [a, b]. */
export function goldenMinimum(f: (x: number) => number, a: number, b: number, iterations = 40): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let lo = a;
  let hi = b;
  let x1 = hi - ratio * (hi - lo);
  let x2 = lo + ratio * (hi - lo);
  let f1 = f(x1);
  let f2 = f(x2);
  for (let i = 0; i < iterations; i++) {
    if (f1 <= f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - ratio * (hi - lo);
      f1 = f(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + ratio * (hi - lo);
      f2 = f(x2);
    }
  }
  return (lo + hi) / 2;
}

export function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
}

/**
 * Finite-difference weights for the `order`-th derivative at `x` over arbitrary `nodes`
 * (Fornberg's algorithm). Works for off-centre nodes, so it stays accurate at span ends.
 */
export function finiteDifferenceWeights(x: number, nodes: readonly number[], order: number): number[] {
  const n = nodes.length;
  const c: number[][] = Array.from({ length: n }, () => new Array<number>(order + 1).fill(0));
  let c1 = 1;
  let c4 = nodes[0]! - x;
  c[0]![0] = 1;
  for (let i = 1; i < n; i++) {
    const mn = Math.min(i, order);
    let c2 = 1;
    const c5 = c4;
    c4 = nodes[i]! - x;
    for (let j = 0; j < i; j++) {
      const c3 = nodes[i]! - nodes[j]!;
      c2 *= c3;
      if (j === i - 1) {
        for (let k = mn; k >= 1; k--) {
          c[i]![k] = (c1 * (k * c[i - 1]![k - 1]! - c5 * c[i - 1]![k]!)) / c2;
        }
        c[i]![0] = (-c1 * c5 * c[i - 1]![0]!) / c2;
      }
      for (let k = mn; k >= 1; k--) {
        c[j]![k] = (c4 * c[j]![k]! - k * c[j]![k - 1]!) / c3;
      }
      c[j]![0] = (c4 * c[j]![0]!) / c3;
    }
    c1 = c2;
  }
  return c.map((row) => row[order]!);
}

/** The `n`-th derivative of `cos(w t)` with respect to `t`. */
export function cosDerivative(w: number, t: number, n: number): number {
  return w ** n * Math.cos(w * t + (n * Math.PI) / 2);
}

/** The `n`-th derivative of `sin(w t)` with respect to `t`. */
export function sinDerivative(w: number, t: number, n: number): number {
  return w ** n * Math.sin(w * t + (n * Math.PI) / 2);
}

/** Solves `A x = b` for vector right-hand sides, by Gaussian elimination with partial pivoting. */
export function solveVectorSystem(matrix: readonly (readonly number[])[], rhs: readonly Vector3[]): Vector3[] {
  const n = matrix.length;
  const a = matrix.map((row) => [...row]);
  const b = [...rhs];
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) {
        pivot = r;
      }
    }
    if (Math.abs(a[pivot]![col]!) < 1e-14) {
      throw new RangeError('Linear system is singular.');
    }
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    for (let r = col + 1; r < n; r++) {
      const factor = a[r]![col]! / a[col]![col]!;
      if (factor === 0) {
        continue;
      }
      for (let c = col; c < n; c++) {
        a[r]![c]! -= factor * a[col]![c]!;
      }
      b[r] = b[r]!.addScaled(b[col]!, -factor);
    }
  }
  const x = new Array<Vector3>(n);
  for (let r = n - 1; r >= 0; r--) {
    let v = b[r]!;
    for (let c = r + 1; c < n; c++) {
      v = v.addScaled(x[c]!, -a[r]![c]!);
    }
    x[r] = v.scale(1 / a[r]![r]!);
  }
  return x;
}

/**
 * Derivatives of a rational curve from those of its homogeneous form, The NURBS Book eq. 4.8.
 * `numerator[k]` and `weight[k]` hold the `k`-th derivatives of `w C` and `w`.
 */
export function rationalDerivatives(numerator: readonly Vector3[], weight: readonly number[]): Vector3[] {
  const result: Vector3[] = [];
  for (let k = 0; k < numerator.length; k++) {
    let v = numerator[k]!;
    for (let i = 1; i <= k; i++) {
      v = v.addScaled(result[k - i]!, -binomial(k, i) * weight[i]!);
    }
    result.push(v.scale(1 / weight[0]!));
  }
  return result;
}

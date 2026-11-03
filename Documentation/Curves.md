# Curve catalogue

Local coordinates below are in the curve's `Frame3`.

## Straight curves

### `Line`

`C(t) = start + t (end - start)`, with `t` in `[0, 1]`. Infinite lines aren't represented, because every curve needs a finite length.

### `Polyline`

Straight segments. The parameter is the vertex index, so `pointAt(2.5)` is the middle of the third segment. With `{ closed: true }` the first vertex repeats at the end. `offset` produces mitred corners, but doesn't remove segments that a large offset folds over.

## Conics

### `CircularArc`

`r (cos t, sin t)`, with `t` the angle in radians. Create a full circle with `CircularArc.circle`, or an arc with `CircularArc.fromThreePoints`. A full turn is periodic.

### `EllipticalArc`

`(a cos t, b sin t)`. `t` is the eccentric angle, not the polar angle of the point. Create a full ellipse with `EllipticalArc.ellipse`.

### `ParabolicArc`

`(t^2 / 4f, t)`, with the vertex at the frame origin, opening along +X. `f` is the focal length.

### `HyperbolicArc`

`(a cosh t, b sinh t)`. One branch, centred at the frame origin.

## Free-form curves

### `BezierCurve`

Any degree, over `[0, 1]`. Pass `weights` for the rational form, reported as `RationalBezierCurve`. Also offers `elevated()`, which raises the degree by one, and `BezierCurve.bernstein`.

### `NurbsCurve`

`new NurbsCurve(degree, controlPoints, knots, weights?)`, with `controlPoints + degree + 1` knots. The domain is `[knots[degree], knots[n + 1]]`, so unclamped knot vectors work. Reports `BSplineCurve` if all weights are equal.

Also offers `insertKnot(u, times)` and `toBezierSegments()`.

### `BSplineCurve`

A non-rational `NurbsCurve` with two extra constructors:

- `BSplineCurve.uniform(degree, points)`: clamped, with even knots over `[0, 1]`
- `BSplineCurve.interpolate(points, degree = 3)`: passes through the points, over `[0, 1]`

## Interpolating splines

These are piecewise cubic, and pass through their points.

### `HermiteSpline`

Takes points, tangents, and optional knots. C1 at the knots. Tangents are derivatives with respect to the parameter, so their size matters.

### `CatmullRomSpline`

Derives the tangents from neighbouring points. `alpha` sets the knot spacing: 0 is uniform, 0.5 is centripetal (the default), and 1 is chordal. Centripetal avoids cusps and self-intersections within a segment. C1, and `{ closed: true }` closes it smoothly.

### `CubicSpline`

C2, over chord-length knots. Ends are natural (zero second derivative) unless you pass `startTangent` or `endTangent`. `{ closed: true }` gives a periodic spline.

## Spirals

### `Helix`

`(r(t) cos t, r(t) sin t, pitch t / 2pi)`, with `t` in radians. `new Helix(frame, radius, pitch, turns, options)`. Options: `leftHanded`, `taper` (radius added per turn, for a conical helix), and `startTurn`.

### `ArchimedeanSpiral`

`r = a + b t` in polar coordinates, with even spacing between turns.

### `LogarithmicSpiral`

`r = a e^(b t)` in polar coordinates, with a constant angle between tangent and radius.

### `InvoluteCurve`

`r (cos t + t sin t, sin t - t cos t)`: the involute of a circle of radius `r`, as on gear teeth. It has a cusp at `t = 0`.

### `Clothoid`

The Euler spiral, used for road and rail transitions. Curvature changes linearly with arc length: `k(s) = k0 + sharpness * s`. The parameter is arc length, and `s = 0` is at the frame origin. Use `Clothoid.fromCurvatures(frame, k0, k1, length)` for the common case. Its position has no closed form, so it is computed by quadrature.

## Roulettes

### `Trochoid`

`(r t - d sin t, r - d cos t)`: a point at distance `d` from the centre of a circle of radius `r`, rolling along X. `Trochoid.cycloid(frame, r, arches)` sets `d = r`.

### `Epitrochoid`

A circle of radius `r` rolling outside a fixed circle of radius `R`. `d = r` gives an epicycloid; `R = r = d` gives a cardioid.

### `Hypotrochoid`

A circle of radius `r` rolling inside a fixed circle of radius `R`. `R = 4r` with `d = r` gives an astroid.

Roulettes have cusps when `d = r`. The [reference](ICurve.md#evaluation) describes how tangent and curvature behave at a cusp.

## Compound and custom curves

### `CompositeCurve`

A connected chain. Each piece keeps its parameter speed, so the domain is `[0, sum of piece domain sizes]`, and derivatives equal those of the pieces. The constructor throws on a gap. `CompositeCurve.connect(curves)` orders and flips unordered pieces first.

### `ParametricCurve`

`new ParametricCurve(fn, start, end, options)`. Options: `derivative`, `breakpoints` and `periodic`. Without a derivative function, derivatives are numeric. It can't be saved to JSON.

## General forms

Operations return these when they can't keep the original class. Each wraps the original curve.

| Class | Parameterization |
|---|---|
| `TrimmedCurve` | The same as the original, over a sub-interval |
| `ReversedCurve` | Mirrored over the same domain |
| `TransformedCurve` | The same as the original |
| `OffsetCurve` | The same as the original. It follows the base curve exactly, so it can loop or develop cusps where the distance exceeds the radius of curvature, and it leaves gaps at corners. |

## What each operation returns

"Same" means the same class, in exact form.

| Curve | `trim` | `reversed` | Non-similarity `transformed` | `offset` | `toNurbs` |
|---|---|---|---|---|---|
| `Line` | Same | Same | Same | Same | Exact |
| `Polyline` | Same | Same | Same | Same (mitred) | Exact, same parameter |
| `CircularArc` | Same | Same | `TransformedCurve` | Same | Exact |
| `EllipticalArc` | Same | Same | `TransformedCurve` | `OffsetCurve` | Exact |
| `ParabolicArc` | Same | Same | `TransformedCurve` | `OffsetCurve` | Exact, same parameter |
| `HyperbolicArc` | Same | Same | `TransformedCurve` | `OffsetCurve` | Exact |
| `BezierCurve` | Same | Same | Same | `OffsetCurve` | Exact, same parameter |
| `NurbsCurve`, `BSplineCurve` | `NurbsCurve` | `NurbsCurve` | `NurbsCurve` | `OffsetCurve` | Itself |
| `HermiteSpline` family | `TrimmedCurve` | `HermiteSpline` | `HermiteSpline` | `OffsetCurve` | Exact, same parameter |
| Spirals, roulettes | Same | `ReversedCurve` | `TransformedCurve` | `OffsetCurve` | Approximate |
| `CompositeCurve` | Same | Same | Same | `OffsetCurve` | Approximate |
| `ParametricCurve` | `TrimmedCurve` | `ReversedCurve` | `TransformedCurve` | `OffsetCurve` | Approximate |

A similarity transform (rotation, reflection, translation, uniform scale) keeps the class of every conic, spiral and roulette too. Approximate conversions are C1 piecewise cubics that keep the parameter.

"Exact" without "same parameter" means the same geometry at a different parameter: rational conics can't reproduce the angle parameter.

## What isn't included

- **Infinite lines and rays**, because every curve must have a finite length. Use a long `Line`.
- **Surface intersection and projection curves**, which need a surface library.
- **Periodic NURBS as a distinct form.** Unclamped knot vectors evaluate correctly, but `isPeriodic` stays false, so parameters clamp.
- **NURBS degree elevation, knot removal and least-squares fitting.** `BezierCurve.elevated` covers the single-span case.

For other parametric shapes, such as a Lissajous curve or a superellipse, use `ParametricCurve`.

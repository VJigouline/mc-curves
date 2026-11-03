# Algorithms and limits

`CurveBase` implements `ICurve` numerically. Classes override it where a closed form exists. This page describes the numeric defaults and where they can fail.

## Arc length

Adaptive 8-point Gauss-Legendre quadrature of the speed `|C'(t)|`, on four starting panels per span between breakpoints, with an absolute error target of about `1e-10`.

Closed forms replace it on `Line`, `Polyline`, `CircularArc`, `Helix` (without taper), `LogarithmicSpiral`, `InvoluteCurve` and `Clothoid`.

`parameterAtLength` runs Newton's method on the length, kept inside a bisection bracket, to a tolerance of `1e-10` times the length.

## Derivatives

Most classes have exact derivatives. `ParametricCurve` without a derivative function, and `OffsetCurve`, use finite differences: Fornberg weights on seven nodes, with a step of `1e-3` of the smooth span, shifted to stay inside it. Accuracy drops with order, to around `1e-7` relative for order 3 on a well-scaled curve.

Rational curves differentiate their homogeneous form and apply the quotient rule (The NURBS Book, eq. 4.8).

## NURBS

Evaluation uses the basis-function derivatives of The NURBS Book, algorithm A2.3. `insertKnot` follows A5.1, in homogeneous coordinates so rational shapes are kept exactly. `trim` inserts knots to full multiplicity at both ends, then cuts. `BSplineCurve.interpolate` follows A9.1, with chord-length parameters and averaged knots.

`BSplineCurve.interpolate` and `CubicSpline` solve a dense system, so their cost grows up to cubically with the number of points. In practice the system is sparse: 2000 points took about 0.1 s on a desktop machine.

## Tessellation

Each smooth span starts as eight pieces. A piece splits while its chord is longer than `maxSegmentLength`, or while the curve at the 1/4, 1/2 or 3/4 parameter is further than `chordTolerance` from the chord. Splitting stops at depth 20.

**Limit:** this checks samples, so the true deviation can slightly exceed the tolerance. The tests allow 1.5 times the tolerance at points the algorithm didn't check. Don't treat the tolerance as a hard guarantee, and use a smaller one if you need a margin.

## Bounding box

32 samples per span, plus the roots of each coordinate's derivative, found by bisection where the derivative changes sign between samples.

**Limit:** two extrema between neighbouring samples can be missed, so a feature much shorter than 1/32 of a span may poke out of the box. Declare `breakpoints` on a `ParametricCurve` with such features.

## Closest point

32 samples per span. Each local minimum of the sampled distance is refined by golden-section search and then Newton steps, and the best result wins.

**Limit:** like the bounding box, it can miss a minimum narrower than the sample spacing. `Line`, `Polyline` and `CircularArc` use closed forms and don't have this limit.

## Intersections

`intersect` tessellates both curves at 1/400 of the smaller bounding-box diagonal and finds segment pairs that come close. Each pair seeds a Gauss-Newton refinement of `|a(t) - b(u)|`. A result counts if the final distance is within `tolerance`.

Limits:

- **Close crossings merge.** Hits closer than `max(10 tolerance, 1e-3 of the smaller diagonal)` count as one, which is what stops a tangent touch being reported many times. Two real crossings that close are reported once.
- **Overlaps aren't segments.** Curves that share a stretch return a scattering of points on it, not the shared interval, and at most 2000 candidates are refined.
- **Tangent contacts lose precision.** The refinement converges slowly there, so the point can be accurate only to around the square root of the tolerance along the curve, even though the gap between the curves is small.
- **Cost** grows with the product of the two segment counts, though bounding-box checks skip most pairs.

`intersectPlane` looks for sign changes of the height above the plane along a fine tessellation, then bisects. A tangent touch has no sign change, so **it isn't reported** unless a tessellation point lands on the plane. A curve lying in the plane returns its tessellation points, not an interval.

## NURBS approximation

For classes without an exact form, `toNurbs` builds C1 piecewise cubics from the point and derivative at evenly spaced parameters, doubling the piece count until the deviation is within tolerance, up to 4096 pieces per span.

**Limit:** deviation is measured at four points per piece, and if the piece limit is reached the result is returned even if it misses the tolerance. Compare the result against the curve if this matters, for instance with a very small tolerance on a long curve.

## Offsets

Only `Line`, `Polyline` and `CircularArc` have exact offsets. `OffsetCurve` follows `C(t) + d (T(t) x N)` directly. It doesn't remove loops or fill the gaps at corners, so it isn't a CAD-style "clean" offset of a sketch.

## Numerical tolerances

| Value | Use |
|---|---|
| `1e-9` | Points coincide (`isClosed`) |
| `1e-7` | Gap allowed between pieces of a `CompositeCurve`; planarity; `equals` |
| `1e-6` | Default `intersect` tolerance |
| `1e-12` | A derivative counts as zero when choosing the tangent direction |

These are absolute. The tests run every curve at model sizes of `1e-3` and `1e6`, and measures, closest points and tessellation hold up at both. Pass tolerances in proportion to the model where a method accepts them, particularly `intersect` and `chordTolerance`, and rescale models well outside that range.

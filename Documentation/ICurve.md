# ICurve reference

Every curve implements `ICurve`. `CurveBase` provides a numeric implementation of all of it, and each class overrides what it can do exactly.

## Properties

| Property | Type | Meaning |
|---|---|---|
| `type` | `string` | Class name, such as `Line`. A full-turn `CircularArc` reports `Circle`, and a full-turn `EllipticalArc` reports `Ellipse`. |
| `domain` | `{ start, end }` | The parameter interval |
| `degree` | `number \| undefined` | Polynomial degree, if the curve has one |
| `isClosed` | `boolean` | The start and end points coincide |
| `isPeriodic` | `boolean` | Parameters wrap around the domain |
| `startPoint`, `endPoint` | `Vector3` | The points at the domain ends |
| `length` | `number` | Total arc length, cached after the first read |

## Evaluation

| Method | Returns |
|---|---|
| `pointAt(t)` | The point at `t` |
| `derivativeAt(t, order = 1)` | The derivative with respect to the parameter. At a joint, the right-hand one. |
| `tangentAt(t)` | Unit tangent. At a cusp, the direction of the first non-zero derivative. |
| `normalAt(t)` | Unit principal normal. On a straight part, a fixed perpendicular to the tangent. |
| `binormalAt(t)` | Unit vector: tangent x normal |
| `frameAt(t)` | `{ origin, tangent, normal, binormal }` |
| `curvatureAt(t)` | Curvature. `Infinity` at a cusp. |
| `radiusOfCurvatureAt(t)` | `1 / curvature`. `Infinity` where the curvature is zero. |
| `torsionAt(t)` | Torsion. Zero where the curvature is zero. |

`derivativeAt` throws `RangeError` unless `order` is a positive integer. Classes without closed-form derivatives go up to order 4, and `Clothoid` up to order 3.

## Arc length

| Method | Returns |
|---|---|
| `breakpoints()` | Parameters where the curve may lose smoothness, including both domain ends |
| `lengthBetween(t0, t1)` | Arc length between two parameters, in either order. Both are clamped to the domain. |
| `parameterAtLength(s)` | The parameter at arc length `s` from the start. `s` is clamped to `[0, length]`. |
| `pointAtLength(s)` | The point at arc length `s` from the start |
| `divideByCount(n)` | `n + 1` parameters, equal lengths apart |
| `divideByLength(step)` | Parameters at lengths 0, `step`, 2 `step`, and so on. The end is included only if it falls on a step. |

## Sampling

| Method | Returns |
|---|---|
| `sample(count)` | `count` points, evenly spaced in the parameter |
| `tessellate({ chordTolerance = 0.01, maxSegmentLength })` | `{ points, parameters }`: a polyline within the tolerance. `Line` and `Polyline` return their exact vertices and ignore the options. |

## Queries

| Method | Returns |
|---|---|
| `boundingBox()` | The tight axis-aligned `BoundingBox3` |
| `closestPoint(p)` | `{ parameter, point, distance }` |
| `distanceTo(p)` | The distance from `p` to the curve |
| `intersect(other, tolerance = 1e-6)` | `[{ point, parameterA, parameterB, distance }]`, sorted by `parameterA`. See [limits](Algorithms.md#intersections). |
| `intersectPlane(origin, normal)` | `[{ point, parameter }]`. Tangent touches aren't reported. |
| `isPlanar(tolerance = 1e-7)` | Whether all points lie in one plane. True for straight curves. |
| `planeNormal(tolerance = 1e-7)` | Unit normal, or `undefined` for straight and non-planar curves |
| `enclosedArea()` | The enclosed area of a closed planar curve, otherwise `undefined`. The curve is assumed not to cross itself: lobes that do are counted by winding. |

## Operations

All of these return new curves.

| Method | Returns |
|---|---|
| `trim(t0, t1)` | The piece between two parameters. Throws if the range is empty. |
| `split(t)` | `[before, after]`. Throws unless `t` is strictly inside the domain. |
| `reversed()` | The same geometry traversed the other way, over a domain of the same size |
| `transformed(transform)` | The curve under an affine `Transform3` |
| `offset(distance, normal?)` | The parallel curve at signed `distance` along `tangent x normal`. `normal` defaults to the plane normal, and is required for straight and non-planar curves. |
| `toNurbs(tolerance = 1e-4)` | The NURBS form |

The result's parameterization can differ from the original's. For example, a trimmed `BezierCurve` has the domain `[0, 1]`, while a trimmed `NurbsCurve` keeps its parameters. The [catalogue](Curves.md) shows what each class returns.

## Other

| Method | Returns |
|---|---|
| `equals(other, tolerance = 1e-7)` | Whether both curves agree at 33 evenly spaced normalized parameters. This compares traversal as well as shape. |
| `toJSON()` | A plain object for `curveFromJSON`. Throws `TypeError` if the curve wraps a function. |

## Supporting types

**`Vector3`**: `add`, `sub`, `scale`, `addScaled`, `negate`, `dot`, `cross`, `length`, `lengthSquared`, `normalized`, `distanceTo`, `lerp`, `anyPerpendicular`, `equals`, `toArray`, `fromArray`, and the constants `ZERO`, `X`, `Y`, `Z`.

**`Transform3`**: `translate`, `scale`, `rotate`, `mirror`, `compose`, `applyToPoint`, `applyToVector`, `similarityScale`, and the constant `IDENTITY`. `a.compose(b)` applies `b` first.

**`Frame3`**: `fromNormal`, `fromAxes`, `toWorld`, `toLocal`, `vectorToWorld`, `transformed`, `flippedY`, `planeNormal`, and the constant `WORLD`. A frame that has been through a mirror is left-handed: use `planeNormal` for the axis that local counter-clockwise motion turns about.

**`BoundingBox3`**: `fromPoints`, `min`, `max`, `center`, `size`, `diagonal`, `contains`, `intersects`.

**`curveFromJSON(json)`**: rebuilds a curve from `toJSON` output. `CatmullRomSpline` and `CubicSpline` come back as the `HermiteSpline` with the same shape and parameters.

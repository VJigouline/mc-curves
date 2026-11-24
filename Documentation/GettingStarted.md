# Getting started

## Concepts

**A curve is a map from a parameter to a 3D point.** Each curve has a finite `domain` `{ start, end }`, and `pointAt(t)` gives the point at `t`. What the parameter means depends on the curve: an angle on a circle, arc length on a clothoid, a vertex index on a polyline. The [catalogue](Curves.md) lists each one.

**Parameters outside the domain are clamped.** Periodic curves, such as a full circle, wrap around instead.

**Curves are immutable.** `trim`, `reversed`, `transformed` and `offset` return new curves.

**Points and directions are both `Vector3`.** It is immutable too, and its `z` defaults to 0, so planar work reads naturally: `new Vector3(1, 2)`.

**Planar curves live in a `Frame3`,** a local coordinate system that places them anywhere in space:

```ts
import { CircularArc, Frame3, Vector3 } from 'mc-curves';

const frame = Frame3.fromNormal(new Vector3(1, 2, 3), new Vector3(0, 1, 1));
const arc = new CircularArc(frame, 5, 0, Math.PI / 2);
```

## Creating curves

```ts
import {
  BezierCurve, BSplineCurve, CatmullRomSpline, CircularArc, Clothoid, CompositeCurve,
  CubicSpline, EllipticalArc, Frame3, Helix, Line, NurbsCurve, ParametricCurve, Polyline, Vector3,
} from 'mc-curves';

const v = (x: number, y: number, z = 0) => new Vector3(x, y, z);

new Line(v(0, 0), v(3, 4));
new Polyline([v(0, 0), v(2, 0), v(2, 2)], { closed: true });

CircularArc.circle(v(0, 0), 2);
CircularArc.fromThreePoints(v(1, 0), v(0, 1), v(-1, 0));
EllipticalArc.ellipse(v(0, 0), 5, 3);

new BezierCurve([v(0, 0), v(1, 3), v(4, 3), v(5, 0)]);
BSplineCurve.uniform(3, [v(0, 0), v(1, 3), v(3, -2), v(5, 3), v(7, 0)]);
BSplineCurve.interpolate([v(0, 0), v(1, 2), v(3, 1), v(5, 3)]);
new NurbsCurve(2, [v(1, 0), v(1, 1), v(0, 1)], [0, 0, 0, 1, 1, 1], [1, Math.SQRT1_2, 1]);

new CatmullRomSpline([v(0, 0), v(2, 3), v(5, 1)], { alpha: 0.5 });
new CubicSpline([v(0, 0), v(2, 3), v(5, 1)], { startTangent: v(1, 0) });

new Helix(Frame3.WORLD, 2, 0.5, 10); // radius 2, pitch 0.5, 10 turns
Clothoid.fromCurvatures(Frame3.WORLD, 0, 0.1, 50);

new CompositeCurve([new Line(v(0, 0), v(1, 0)), new Line(v(1, 0), v(1, 1))]);
new ParametricCurve((t) => v(t, Math.sin(t)), 0, 10);
```

Constructors throw `RangeError` on invalid input, such as a zero radius or a wrong knot count.

## Common tasks

### Evaluate

```ts
curve.pointAt(t);
curve.derivativeAt(t, 2); // second derivative
curve.frameAt(t);         // origin, tangent, normal, binormal
curve.curvatureAt(t);
```

### Measure and divide

```ts
curve.length;
curve.lengthBetween(t0, t1);
curve.pointAtLength(12.5);
curve.divideByCount(10);   // 11 parameters, equal length apart
curve.divideByLength(2.5);
```

### Draw

```ts
const { points, parameters } = curve.tessellate({ chordTolerance: 0.01 });
```

To feed a renderer such as three.js, map the points to its own vector type. `parameters[i]` is the curve parameter of `points[i]`.

### Query

```ts
const { point, parameter, distance } = curve.closestPoint(target);
curve.boundingBox();
curve.intersect(other);                 // [{ point, parameterA, parameterB, distance }]
curve.intersectPlane(origin, normal);   // [{ point, parameter }]
curve.enclosedArea();                   // closed planar curves only
```

### Edit

```ts
const piece = curve.trim(t0, t1);
const [before, after] = curve.split(t);
const back = curve.reversed();
const moved = curve.transformed(Transform3.rotate(Vector3.Z, Math.PI / 2));
const parallel = curve.offset(1.5);
```

`offset` measures along `tangent x normal`. For a counter-clockwise planar curve seen from the tip of its normal, a positive distance goes outward. Straight and non-planar curves have no plane of their own, so pass the normal: `line.offset(1, Vector3.Z)`.

Transforms combine with `compose`, whose argument applies first:

```ts
const t = Transform3.translate(v(5, 0)).compose(Transform3.scale(2)); // scale, then move
```

### Convert to NURBS

```ts
const nurbs = curve.toNurbs(1e-4);
```

The result is exact for lines, polylines, conics, Bezier curves and the Hermite family. Everything else gets a cubic approximation within the tolerance. Some exact forms use a different parameterization, as the [catalogue](Curves.md) explains.

### Save and load

```ts
const text = JSON.stringify(curve.toJSON());
const restored = curveFromJSON(JSON.parse(text));
```

A `ParametricCurve` can't be saved, because it holds a function. Convert it with `toNurbs()` first.

## Adding your own curve

For a one-off, use `ParametricCurve`. For a reusable class, extend `CurveBase` and implement two members; every other `ICurve` method then works numerically:

```ts
import { CurveBase, Vector3, type CurveDomain, type CurveJSON } from 'mc-curves';

class Sine extends CurveBase {
  readonly type = 'Sine';
  readonly domain: CurveDomain = { start: 0, end: 10 };

  protected evaluate(t: number): Vector3 {
    return new Vector3(t, Math.sin(t));
  }

  toJSON(): CurveJSON {
    return { type: this.type };
  }
}
```

Override `evaluateDerivative` for exact derivatives, which also makes the numeric methods faster and more accurate. If the curve has joints, override `breakpoints` so numeric methods don't cross them.

Custom classes aren't known to `curveFromJSON`, so they need their own loader.

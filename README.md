# MeerCADCurves

CAD curves in TypeScript. Lines, conics, splines, NURBS, spirals and roulettes all implement one `ICurve` interface, so the same code can evaluate, measure, tessellate, intersect, trim, transform and save any of them.

- Works in 3D, with no runtime dependencies
- Immutable curves: operations return new curves
- Closed-form results where they exist, and tested numerics where they don't
- Ships as an ES module with type declarations

## Install

The package isn't published to npm yet. Install it from a local clone:

```sh
git clone https://github.com/VJigouline/MeerCADCurves.git
cd MeerCADCurves
npm ci
```

Then, from your project:

```sh
npm install ../MeerCADCurves
```

Node.js 22 or later is required.

## Quick example

```ts
import { BSplineCurve, CircularArc, Line, Transform3, Vector3, curveFromJSON } from 'meercad-curves';

// Every curve shares the ICurve interface.
const circle = CircularArc.circle(new Vector3(0, 0), 2);
const spline = BSplineCurve.interpolate([
  new Vector3(0, 0),
  new Vector3(1, 2),
  new Vector3(3, 1, 1),
  new Vector3(5, 3),
]);

circle.length;                       // 12.566...
circle.curvatureAt(0);               // 0.5
spline.pointAt(0.5);                 // Vector3
spline.tangentAt(0.5);               // unit Vector3
spline.tessellate({ chordTolerance: 0.01 }).points;

// Queries
spline.closestPoint(new Vector3(2, 2)).distance;
new Line(new Vector3(-5, 0), new Vector3(5, 0)).intersect(circle); // two hits

// Operations return new curves.
const [left, right] = spline.split(0.4);
const moved = circle.transformed(Transform3.translate(new Vector3(10, 0)));
const nurbs = circle.toNurbs();      // exact rational form

// Save and restore
const copy = curveFromJSON(JSON.parse(JSON.stringify(moved.toJSON())));
```

## Curves

| Group | Classes |
|---|---|
| Straight | `Line`, `Polyline` |
| Conics | `CircularArc` (circle), `EllipticalArc` (ellipse), `ParabolicArc`, `HyperbolicArc` |
| Free-form | `BezierCurve` (with rational form), `BSplineCurve`, `NurbsCurve` |
| Interpolating splines | `HermiteSpline`, `CatmullRomSpline`, `CubicSpline` |
| Spirals | `Helix`, `ArchimedeanSpiral`, `LogarithmicSpiral`, `InvoluteCurve`, `Clothoid` |
| Roulettes | `Trochoid` (cycloid), `Epitrochoid` (epicycloid), `Hypotrochoid` (hypocycloid) |
| Compound | `CompositeCurve` |
| Custom | `ParametricCurve`, for any function of the parameter |

Operations that can't keep a curve's class return one of these general forms: `TrimmedCurve`, `ReversedCurve`, `TransformedCurve` or `OffsetCurve`.

## Documentation

- [Getting started](Documentation/GettingStarted.md): concepts and common tasks
- [ICurve reference](Documentation/ICurve.md): every property and method
- [Curve catalogue](Documentation/Curves.md): each curve's formula, parameter and exact operations
- [Algorithms and limits](Documentation/Algorithms.md): how results are computed, and where they stop being reliable

## Development

| Command | Purpose |
|---|---|
| `npm test` | Run the tests |
| `npm run coverage` | Run the tests with a coverage report |
| `npm run typecheck` | Type-check the sources and tests |
| `npm run build` | Compile to `dist` |

The core of the test suite is `tests/contract.test.ts`, which checks every curve in `tests/catalog.ts` against the whole interface, and `tests/scale.test.ts` repeats key checks on very small and very large models. Add a new curve to the catalogue and it is held to the same contract.

## License

[MIT](LICENSE)

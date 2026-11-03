import { describe, expect, it } from 'vitest';
import { BSplineCurve, CircularArc, Line, Transform3, Vector3, type ICurve } from '../src/index.js';
import { catalog } from './catalog.js';
import { expectPoint } from './helpers.js';

/** Model sizes the documentation says are supported. */
const SCALES = [1e-3, 1e6];

describe.each(SCALES)('at model scale %d', (scale) => {
  const scaleUp = Transform3.scale(scale);

  describe.each(Object.entries(catalog))('%s', (_name, make) => {
    const base = make();
    const curve: ICurve = base.transformed(scaleUp);

    it('scales its measures, promptly', { timeout: 5000 }, () => {
      expect(curve.length / (base.length * scale)).toBeCloseTo(1, 6);
      const box = curve.boundingBox();
      expect(box.diagonal / (base.boundingBox().diagonal * scale)).toBeCloseTo(1, 3);
      const middle = curve.parameterAtLength(curve.length / 2);
      expect(curve.lengthBetween(curve.domain.start, middle) / (curve.length / 2)).toBeCloseTo(1, 6);
    });

    it('finds closest points, and tessellates in proportion', { timeout: 5000 }, () => {
      const t = curve.domain.start + (curve.domain.end - curve.domain.start) * 0.37;
      expect(curve.distanceTo(curve.pointAt(t)) / scale).toBeLessThan(1e-6);
      const coarse = base.tessellate({ chordTolerance: 0.01 }).points.length;
      const scaled = curve.tessellate({ chordTolerance: 0.01 * scale }).points.length;
      expect(scaled).toBe(coarse);
    });
  });

  it('intersects, given a tolerance in proportion', { timeout: 5000 }, () => {
    const circle = CircularArc.circle(new Vector3(0, 0), scale);
    const line = new Line(new Vector3(-2 * scale, 0), new Vector3(2 * scale, 0));
    const hits = line.intersect(circle, 1e-7 * scale);
    expect(hits).toHaveLength(2);
    expectPoint(hits[1]!.point, new Vector3(scale, 0), 1e-5 * scale);
  });

  it('interpolates', { timeout: 5000 }, () => {
    const points = [new Vector3(0, 0), new Vector3(scale, 2 * scale), new Vector3(3 * scale, scale), new Vector3(5 * scale, 3 * scale)];
    const spline = BSplineCurve.interpolate(points);
    for (const p of points) {
      expect(spline.distanceTo(p) / scale).toBeLessThan(1e-9);
    }
  });
});

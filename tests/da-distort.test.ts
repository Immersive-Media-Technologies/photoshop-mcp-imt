// Deep Artisan 20.09: математика корнер-пина (гомография + Безье-интерполяция).
import { describe, expect, it } from 'vitest';
import { applyHomography, bezierControlPoints, homographyFromUnitSquare, meshForQuad } from '../src/tools/da-distort-tools.js';

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

describe('da distort math', () => {
  it('homography maps unit-square corners to the quad', () => {
    const h = homographyFromUnitSquare([200, 150], [520, 220], [520, 380], [200, 450]);
    const c = [applyHomography(h, 0, 0), applyHomography(h, 1, 0), applyHomography(h, 1, 1), applyHomography(h, 0, 1)];
    expect(c.map((p) => p.map(Math.round))).toEqual([[200, 150], [520, 220], [520, 380], [200, 450]]);
  });
  it('bezier control points interpolate the sampled surface at the nodes', () => {
    const f = (u: number, v: number): [number, number] => [100 + 300 * u + 20 * u * v, 50 + 200 * v - 10 * u * u];
    const P = bezierControlPoints(f);
    const ts = [0, 1 / 3, 2 / 3, 1];
    const bern = (t: number): number[] => [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
    for (const v of ts) for (const u of ts) {
      const bu = bern(u), bv = bern(v);
      let x = 0, y = 0;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x += bv[i] * bu[j] * P[i * 4 + j][0]; y += bv[i] * bu[j] * P[i * 4 + j][1]; }
      const [fx, fy] = f(u, v);
      expect(close(x, fx) && close(y, fy), `${u},${v}`).toBe(true);
    }
  });
  it('identity quad gives an identity mesh in both modes', () => {
    for (const mode of ['perspective', 'bilinear'] as const) {
      const m = meshForQuad([0, 0], [300, 0], [300, 300], [0, 300], mode);
      expect(m.length).toBe(16);
      expect(m[0].map(Math.round)).toEqual([0, 0]);
      expect(m[3].map(Math.round)).toEqual([300, 0]);
      expect(m[15].map(Math.round)).toEqual([300, 300]);
      expect(m[5].map(Math.round)).toEqual([100, 100]);
    }
  });
  it('perspective interior differs from bilinear on a trapezoid', () => {
    const p = meshForQuad([200, 150], [520, 220], [520, 380], [200, 450], 'perspective');
    const b = meshForQuad([200, 150], [520, 220], [520, 380], [200, 450], 'bilinear');
    expect(p[0]).toEqual(b[0]);
    expect(Math.abs(p[5][0] - b[5][0])).toBeGreaterThan(20);
  });
});

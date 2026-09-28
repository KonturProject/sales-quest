import { describe, expect, it } from 'vitest';
import { cameraPosition } from '../../src/scene/cameraRig.ts';

function expectClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 6));
}

describe('cameraPosition', () => {
  it('puts a 90° pitch straight above the target', () => {
    expectClose(cameraPosition({ pitchDeg: 90, yawDeg: 0 }, 10), [0, 10, 0]);
  });

  it('puts pitch 0, yaw 0 on the +Z axis', () => {
    expectClose(cameraPosition({ pitchDeg: 0, yawDeg: 0 }, 10), [0, 0, 10]);
  });

  it('gives the classic isometric-style view for pitch 45°, yaw 45° (GFX-1)', () => {
    expectClose(cameraPosition({ pitchDeg: 45, yawDeg: 45 }, 10), [5, Math.SQRT2 * 5, 5]);
  });

  it('keeps the distance and offsets by the target', () => {
    const [x, y, z] = cameraPosition({ pitchDeg: 30, yawDeg: 120 }, 7, [1, 2, 3]);
    expect(Math.hypot(x - 1, y - 2, z - 3)).toBeCloseTo(7, 6);
  });
});

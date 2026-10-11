import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { NetworkError } from '../../../src/admin/github.ts';
import { adminMessage } from '../../../src/admin/session.ts';

describe('errors in words for the admin (review 2a)', () => {
  it('a schema error is one readable line with the place, not a JSON dump', () => {
    const error = z
      .object({ records: z.array(z.object({ inv6: z.number().min(0, 'меньше нуля') })) })
      .safeParse({ records: [{ inv6: -1 }] }).error;
    expect(adminMessage(error)).toBe('данные не прошли проверку: records.0.inv6 — меньше нуля');
  });

  it('no network is said as such; a bug is shown as it is, not as «no network»', () => {
    expect(adminMessage(new NetworkError())).toMatch(/нет связи/);
    expect(adminMessage(new TypeError('x is undefined'))).toBe('x is undefined');
  });
});

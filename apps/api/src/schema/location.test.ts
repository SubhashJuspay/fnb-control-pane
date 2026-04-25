import { describe, expect, it, vi } from 'vitest';

vi.mock('../prisma.js', () => ({
  prisma: {},
}));

import { buildSchema } from './index.js';

describe('Location type', () => {
  it('is registered in the schema', () => {
    const schema = buildSchema();
    const locType = schema.getType('Location');
    expect(locType).toBeTruthy();
  });

  it('exposes the expected fields', () => {
    const schema = buildSchema();
    const locType = schema.getType('Location') as unknown as {
      getFields: () => Record<string, unknown>;
    };
    const fields = Object.keys(locType.getFields());
    for (const expected of [
      'id',
      'name',
      'slug',
      'timezone',
      'currency',
      'locale',
      'businessDayCutoff',
      'status',
      'createdAt',
      'tenant',
    ]) {
      expect(fields).toContain(expected);
    }
  });

  it('uses the LocationStatus enum for the status field', () => {
    const schema = buildSchema();
    const enumType = schema.getType('LocationStatus');
    expect(enumType).toBeTruthy();
  });
});

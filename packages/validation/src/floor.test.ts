import { describe, expect, it } from 'vitest';
import { createTableSchema, updateTableSchema, createSectionSchema } from './floor.js';

describe('createTableSchema', () => {
  it('accepts a minimal valid table', () => {
    expect(createTableSchema.safeParse({
      label: 'T-1', positionX: 0, positionY: 0,
    }).success).toBe(true);
  });
  it('rejects negative positions', () => {
    expect(createTableSchema.safeParse({
      label: 'T-1', positionX: -10, positionY: 0,
    }).success).toBe(false);
  });
  it('rejects capacity 0', () => {
    expect(createTableSchema.safeParse({
      label: 'T-1', positionX: 0, positionY: 0, capacity: 0,
    }).success).toBe(false);
  });
  it('rejects rotation outside 0..359', () => {
    expect(createTableSchema.safeParse({
      label: 'T-1', positionX: 0, positionY: 0, rotation: 360,
    }).success).toBe(false);
  });
});

describe('updateTableSchema', () => {
  it('accepts partial update with id', () => {
    expect(updateTableSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      label: 'T-2',
    }).success).toBe(true);
  });
  it('rejects missing id', () => {
    expect(updateTableSchema.safeParse({ label: 'T-2' }).success).toBe(false);
  });
});

describe('createSectionSchema', () => {
  it('accepts valid name', () => {
    expect(createSectionSchema.safeParse({ name: 'Patio' }).success).toBe(true);
  });
  it('rejects empty name', () => {
    expect(createSectionSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

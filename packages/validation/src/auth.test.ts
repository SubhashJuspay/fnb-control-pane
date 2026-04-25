import { describe, expect, it } from 'vitest';
import { signInSchema, signUpSchema } from './auth.js';

describe('signInSchema', () => {
  it('accepts a valid email and password', () => {
    const result = signInSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = signInSchema.safeParse({
      email: 'not-an-email',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 chars', () => {
    const result = signInSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('requires invitation token, name, and password', () => {
    const result = signUpSchema.safeParse({
      token: 'a'.repeat(48),
      name: 'Alice',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = signUpSchema.safeParse({
      token: 'a'.repeat(48),
      name: '',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });
});

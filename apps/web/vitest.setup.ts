import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest doesn't auto-run testing-library cleanup between tests.
afterEach(() => {
  cleanup();
});

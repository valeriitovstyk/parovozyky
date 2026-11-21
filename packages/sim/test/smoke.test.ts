import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from '../src/index';

describe('sim package', () => {
  it('loads', () => {
    expect(SIM_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

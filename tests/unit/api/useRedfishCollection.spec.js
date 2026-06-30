import { describe, it, expect } from 'vitest';
import { shouldFallbackFromExpand } from '@/api/composables/useRedfishCollection';

describe('shouldFallbackFromExpand', () => {
  it('falls back on 400 and 501 (expand not supported)', () => {
    expect(shouldFallbackFromExpand({ response: { status: 400 } })).toBe(true);
    expect(shouldFallbackFromExpand({ response: { status: 501 } })).toBe(true);
  });

  it('falls back on 5xx server errors (broken expand implementation)', () => {
    expect(shouldFallbackFromExpand({ response: { status: 500 } })).toBe(true);
    expect(shouldFallbackFromExpand({ response: { status: 503 } })).toBe(true);
  });

  it('does not fall back on auth errors', () => {
    expect(shouldFallbackFromExpand({ response: { status: 401 } })).toBe(false);
    expect(shouldFallbackFromExpand({ response: { status: 403 } })).toBe(false);
  });

  it('does not fall back on network errors without status', () => {
    expect(shouldFallbackFromExpand(new Error('network'))).toBe(false);
  });
});

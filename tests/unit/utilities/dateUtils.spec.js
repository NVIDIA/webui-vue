import { describe, expect, it } from 'vitest';
import { toFormatDate, toValidDate } from '@/utilities/dateUtils';

describe('toValidDate', () => {
  it('returns null for a missing timestamp', () => {
    expect(toValidDate(undefined)).toBeNull();
    expect(toValidDate(null)).toBeNull();
    expect(toValidDate('')).toBeNull();
  });

  it('returns null for an Invalid Date instead of a truthy Date object', () => {
    expect(toValidDate(new Date(undefined))).toBeNull();
    expect(toValidDate('not-a-date')).toBeNull();
  });

  it('keeps a parseable timestamp', () => {
    const parsed = toValidDate('2026-01-02T03:04:05Z');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.toISOString()).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('toFormatDate', () => {
  it('formats a Date and drops an Invalid Date', () => {
    const parsed = toFormatDate(new Date('2026-01-02T03:04:05Z'));
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(toFormatDate(new Date(undefined))).toBeNull();
  });

  it('leaves strings and numbers blank', () => {
    expect(toFormatDate('2026-01-02T03:04:05Z')).toBeNull();
    expect(toFormatDate(0)).toBeNull();
    expect(toFormatDate(1_700_000_000_000)).toBeNull();
  });
});

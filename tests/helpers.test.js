import { describe, it, expect } from 'vitest';
import { fmtDate, monthKey, escH, safeNum, clampNum, parseDateParts } from '../js/helpers.js';

describe('fmtDate', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const d = new Date(2025, 0, 5); // Jan 5, 2025
    expect(fmtDate(d)).toBe('2025-01-05');
  });

  it('pads single-digit months and days', () => {
    const d = new Date(2025, 2, 9); // Mar 9
    expect(fmtDate(d)).toBe('2025-03-09');
  });
});

describe('monthKey', () => {
  it('returns YYYY-MM from year and 0-based month', () => {
    expect(monthKey(2025, 0)).toBe('2025-01');
    expect(monthKey(2025, 11)).toBe('2025-12');
  });
});

describe('escH', () => {
  it('escapes HTML special characters', () => {
    expect(escH('<script>"hi"&\'bye\'')).toBe(
      '&lt;script&gt;&quot;hi&quot;&amp;&#39;bye&#39;'
    );
  });

  it('handles numbers', () => {
    expect(escH(42)).toBe('42');
  });
});

describe('safeNum', () => {
  it('returns finite numbers', () => {
    expect(safeNum(42)).toBe(42);
    expect(safeNum('3.14')).toBe(3.14);
  });

  it('returns 0 for non-numeric values', () => {
    expect(safeNum(null)).toBe(0);
    expect(safeNum(undefined)).toBe(0);
    expect(safeNum('abc')).toBe(0);
    expect(safeNum(Infinity)).toBe(0);
    expect(safeNum(NaN)).toBe(0);
  });
});

describe('clampNum', () => {
  it('clamps values within range', () => {
    expect(clampNum(5, 0, 10)).toBe(5);
    expect(clampNum(-1, 0, 10)).toBe(0);
    expect(clampNum(15, 0, 10)).toBe(10);
  });

  it('handles non-numeric input', () => {
    expect(clampNum('abc', 0, 100)).toBe(0);
    expect(clampNum(null, 0, 100)).toBe(0);
  });
});

describe('parseDateParts', () => {
  it('splits a date string into parts', () => {
    const result = parseDateParts('2025-03-15');
    expect(result.year).toBe('2025');
    expect(result.month).toBe('03');
    expect(result.day).toBe('15');
    expect(result.mk).toBe('2025-03');
  });
});

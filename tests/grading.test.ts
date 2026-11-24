import { describe, expect, it } from 'vitest';
import { check, scoreSheet, starsFor, toNumber } from '@/lib/grading';

describe('toNumber', () => {
  it('reads whole numbers, decimals, fractions and mixed numbers', () => {
    expect(toNumber('12')).toBe(12);
    expect(toNumber('.5')).toBe(0.5);
    expect(toNumber('3/4')).toBe(0.75);
    expect(toNumber('1 1/2')).toBe(1.5);
    expect(toNumber('-2 1/4')).toBe(-2.25);
    expect(toNumber('1,200')).toBe(1200);
    expect(Number.isNaN(toNumber('abc'))).toBe(true);
    expect(Number.isNaN(toNumber('3/0'))).toBe(true);
  });
});

describe('check', () => {
  it('accepts equivalent numbers', () => {
    expect(check({ format: 'NUMERIC', answer: '3/4' }, '0.75')).toBe(true);
    expect(check({ format: 'NUMERIC', answer: '3/4' }, '6/8')).toBe(true);
    expect(check({ format: 'NUMERIC', answer: '3/4' }, '3/5')).toBe(false);
  });
  it('ignores letter order and case for several letters', () => {
    expect(check({ format: 'MULTI', answer: 'A,C' }, 'c a')).toBe(true);
    expect(check({ format: 'MULTI', answer: 'A,C' }, 'A')).toBe(false);
  });
  it('marks blanks wrong and leaves written answers to Vienne', () => {
    expect(check({ format: 'MC', answer: 'B' }, '')).toBe(false);
    expect(check({ format: 'OPEN', answer: null }, 'anything')).toBeNull();
  });
});

describe('scoreSheet', () => {
  it('scores, totals points and waits for written answers', () => {
    const items = [
      { number: 1, format: 'MC' as const, answer: 'A', points: 1 },
      { number: 2, format: 'NUMERIC' as const, answer: '1/2', points: 1 },
      { number: 3, format: 'OPEN' as const, answer: null, points: 2 },
    ];
    const r = scoreSheet(items, [{ number: 1, value: 'A' }, { number: 2, value: '0.5' }]);
    expect(r.autoScore).toBe(2);
    expect(r.maxScore).toBe(4);
    expect(r.waiting).toBe(true);
    expect(r.stars).toBe(0);
    expect(starsFor(9, 10)).toBe(3);
  });
});

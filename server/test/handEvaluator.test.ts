import { describe, expect, it } from 'vitest';
import { compareHands, evaluateHand } from '../src/game/handEvaluator';
import { hand } from './helpers';

describe('ترتيب قوة الأيدي (حسب المواصفة)', () => {
  it('AAAA > KKKK', () => {
    expect(compareHands(hand('A A A A'), hand('K K K K'))).toBeGreaterThan(0);
  });

  it('KKKK > QQQQ', () => {
    expect(compareHands(hand('K K K K'), hand('Q Q Q Q'))).toBeGreaterThan(0);
  });

  it('QQQQ > JJJJ', () => {
    expect(compareHands(hand('Q Q Q Q'), hand('J J J J'))).toBeGreaterThan(0);
  });

  it('AAAK > KKKQ (ثلاثي آكه أقوى من ثلاثي شايب)', () => {
    expect(compareHands(hand('A A A K'), hand('K K K Q'))).toBeGreaterThan(0);
  });

  it('AAKQ > AAQJ (نفس الثنائي — الكيكر K أقوى من Q)', () => {
    expect(compareHands(hand('A A K Q'), hand('A A Q J'))).toBeGreaterThan(0);
  });

  it('AAKJ > AAQJ (نفس الثنائي — الكيكر الأول K أقوى من Q)', () => {
    expect(compareHands(hand('A A K J'), hand('A A Q J'))).toBeGreaterThan(0);
  });
});

describe('فئات الأيدي الكاملة', () => {
  it('الرباعي أقوى من الثلاثي', () => {
    expect(compareHands(hand('J J J J'), hand('A A A K'))).toBeGreaterThan(0);
  });

  it('الثلاثي أقوى من الزوجين', () => {
    expect(compareHands(hand('J J J A'), hand('A A K K'))).toBeGreaterThan(0);
  });

  it('الزوجان أقوى من الثنائي', () => {
    expect(compareHands(hand('K K Q Q'), hand('A A Q J'))).toBeGreaterThan(0);
  });

  it('الثنائي أقوى من بدون زوج', () => {
    expect(compareHands(hand('J J A K'), hand('A K Q J'))).toBeGreaterThan(0);
  });

  it('كسر تعادل الثلاثي بالورقة المتبقية: AAAK > AAAQ', () => {
    expect(compareHands(hand('A A A K'), hand('A A A Q'))).toBeGreaterThan(0);
  });

  it('كسر تعادل الزوجين بالزوج الثاني: AAKK > AAQQ', () => {
    expect(compareHands(hand('A A K K'), hand('A A Q Q'))).toBeGreaterThan(0);
  });

  it('كسر تعادل الثنائي بالكيكر الأخير: AAKQ > AAKJ', () => {
    expect(compareHands(hand('A A K Q'), hand('A A K J'))).toBeGreaterThan(0);
  });

  it('يدان متطابقتان تمامًا تتعادلان', () => {
    expect(compareHands(hand('A A K Q'), hand('A A K Q'))).toBe(0);
  });

  it('بدون زوج: كل الأيدي متعادلة', () => {
    expect(compareHands(hand('A K Q J'), hand('J Q K A'))).toBe(0);
  });
});

describe('الوصف العربي لليد', () => {
  it('رباعي آكه', () => {
    expect(evaluateHand(hand('A A A A')).label).toBe('رباعي آكه');
  });
  it('ثلاثي شايب', () => {
    expect(evaluateHand(hand('K K K A')).label).toBe('ثلاثي شايب');
  });
  it('ثنائي آكه', () => {
    expect(evaluateHand(hand('A A K Q')).label).toBe('ثنائي آكه');
  });
  it('زوجان', () => {
    expect(evaluateHand(hand('A A K K')).label).toContain('زوجان');
  });
  it('بدون زوج', () => {
    expect(evaluateHand(hand('A K Q J')).label).toBe('بدون زوج');
  });
});

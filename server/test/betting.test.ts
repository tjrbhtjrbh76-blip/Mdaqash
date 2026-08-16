import { describe, expect, it } from 'vitest';
import { forcedEntryAmount, isMultipleOfStep, validateEntry } from '../src/game/betting';

describe('قواعد مبالغ الدخول — مضاعفات 500 فقط', () => {
  it('المبالغ المسموحة: 500 / 1000 / 1500 / 2000', () => {
    for (const amount of [500, 1000, 1500, 2000, 2500, 5000]) {
      expect(validateEntry(amount, 10_000, false).ok, `amount=${amount}`).toBe(true);
    }
  });

  it('المبالغ المرفوضة: 700 / 1250 / 2750 / أرقام كسرية', () => {
    for (const amount of [700, 1250, 2750, 501, 999, 500.5]) {
      const res = validateEntry(amount, 10_000, false);
      expect(res.ok, `amount=${amount}`).toBe(false);
      expect(res.error).toBe('INVALID_AMOUNT');
    }
  });

  it('isMultipleOfStep تعمل بدقة', () => {
    expect(isMultipleOfStep(500)).toBe(true);
    expect(isMultipleOfStep(0)).toBe(true);
    expect(isMultipleOfStep(700)).toBe(false);
  });
});

describe('الحد الأدنى والرصيد', () => {
  it('لاعب برصيد 500 يستطيع الدخول بـ 500', () => {
    expect(validateEntry(500, 500, false).ok).toBe(true);
  });

  it('لاعب برصيد أقل من 500 لا يستطيع الدخول', () => {
    const res = validateEntry(500, 400, false);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('INSUFFICIENT_BALANCE');
  });

  it('لا يمكن الدخول بـ 0', () => {
    const res = validateEntry(0, 5000, false);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('MIN_BET');
  });

  it('لا يمكن تجاوز الرصيد', () => {
    const res = validateEntry(1500, 1000, false);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('INSUFFICIENT_BALANCE');
  });

  it('All-in للمُجبَر المفلس فقط (رصيد أقل من 500)', () => {
    expect(validateEntry(300, 300, true).ok).toBe(true);
    expect(validateEntry(0, 0, true).ok).toBe(true);
    // غير المُجبَر لا يستفيد من الاستثناء
    expect(validateEntry(300, 300, false).ok).toBe(false);
  });

  it('forcedEntryAmount: 500 عادةً، أو كل الرصيد إن كان أقل', () => {
    expect(forcedEntryAmount(5000)).toBe(500);
    expect(forcedEntryAmount(500)).toBe(500);
    expect(forcedEntryAmount(300)).toBe(300);
    expect(forcedEntryAmount(0)).toBe(0);
  });
});

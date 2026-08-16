import { BET_STEP, MIN_BET } from '../shared/constants';
import { Ack, ErrorCode } from '../shared/types';

/**
 * قواعد الدخول/الرهان — يتم التحقق منها على السيرفر فقط.
 *
 * - جميع المبالغ من مضاعفات 500 (500, 1000, 1500, 2000, ...)
 * - الحد الأدنى للدخول 500
 * - لا يمكن تجاوز الرصيد
 * - استثناء وحيد: اللاعب المُجبَر (يمين الموزع) إذا كان رصيده أقل من 500
 *   يدخل بكل ما تبقى لديه (All-in) حتى لا تتعطل الجولة.
 */

export function isMultipleOfStep(amount: number): boolean {
  return Number.isInteger(amount) && amount % BET_STEP === 0;
}

export interface BetValidation {
  ok: boolean;
  error?: ErrorCode;
}

export function validateEntry(amount: number, balance: number, forced: boolean): BetValidation {
  if (!Number.isInteger(amount) || amount < 0) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }
  if (amount > balance) {
    return { ok: false, error: 'INSUFFICIENT_BALANCE' };
  }
  // حالة All-in الاستثنائية: رصيد أقل من الحد الأدنى — متاحة فقط للاعب المُجبَر
  const isAllInBelowMin = amount === balance && balance < MIN_BET;
  if (isAllInBelowMin) {
    return forced ? { ok: true } : { ok: false, error: 'MIN_BET' };
  }
  if (!isMultipleOfStep(amount)) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }
  if (amount < MIN_BET) {
    return { ok: false, error: 'MIN_BET' };
  }
  return { ok: true };
}

/** مبلغ الدخول التلقائي للاعب غير المتصل المُجبَر على الدخول */
export function forcedEntryAmount(balance: number): number {
  return balance >= MIN_BET ? MIN_BET : balance;
}

export function err(error: ErrorCode): Ack {
  return { ok: false, error, message: error };
}

export function ok<T>(data?: T): Ack<T> {
  return { ok: true, data };
}

/**
 * التحقق من عرض المفاوضة (يقدمه الكبير من سومته):
 * - مضاعفات 500 فقط
 * - الحد الأدنى 500
 * - لا يتجاوز المبلغ المتبقي من ميزانية المفاوضة
 */
export function validateOffer(amount: number, remainingBudget: number): BetValidation {
  if (!Number.isInteger(amount) || amount < 0) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }
  if (!isMultipleOfStep(amount)) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }
  if (amount < MIN_BET) {
    return { ok: false, error: 'MIN_BET' };
  }
  if (amount > remainingBudget) {
    return { ok: false, error: 'EXCEEDS_BUDGET' };
  }
  return { ok: true };
}
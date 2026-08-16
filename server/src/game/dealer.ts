import { PLAYER_COUNT } from '../shared/constants';

/**
 * إدارة الموزع والترتيب الدائري للاعبين.
 *
 * الترتيب دائري حقيقي معتمد على dealerIndex فقط:
 *   rightOfDealer = nextPlayer(dealerIndex)
 * اللاعب الموجود مباشرة على يمين الموزع ملزم بالدخول (500 على الأقل).
 */

/** اللاعب التالي في الترتيب الدائري */
export function nextPlayer(index: number, count: number = PLAYER_COUNT): number {
  return (index + 1) % count;
}

/** اللاعب الموجود مباشرة على يمين الموزع */
export function rightOfDealer(dealerIndex: number, count: number = PLAYER_COUNT): number {
  return nextPlayer(dealerIndex, count);
}

/**
 * ترتيب الأدوار في جولة المراهنة:
 * يبدأ من يمين الموزع ويدور حتى ينتهي بالموزع نفسه.
 * مثال: dealerIndex=0 → [1, 2, 3, 0]
 */
export function turnOrderOf(dealerIndex: number, count: number = PLAYER_COUNT): number[] {
  const order: number[] = [];
  for (let i = 1; i <= count; i++) {
    order.push((dealerIndex + i) % count);
  }
  return order;
}

/** تدوير الموزع للاعب التالي في الجولة التالية */
export function rotateDealer(dealerIndex: number, count: number = PLAYER_COUNT): number {
  return nextPlayer(dealerIndex, count);
}

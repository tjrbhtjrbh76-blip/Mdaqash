import { randomInt } from 'crypto';
import { Card, Rank, Suit } from '../shared/types';

/**
 * مجموعة الأوراق: 16 ورقة فقط
 * 4× آكه (A) + 4× شايب (K) + 4× بنت (Q) + 4× ولد (J)
 * المجموعات (Suits) تجميلية فقط ولا تؤثر على قوة اليد.
 */
export const RANKS: readonly Rank[] = ['A', 'K', 'Q', 'J'];
export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit, id: `${rank}-${suit}` });
    }
  }
  return deck;
}

/**
 * خلط عشوائي آمن (Fisher–Yates مع crypto) — يتم على السيرفر فقط.
 */
export function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/**
 * توزيع الأوراق: كل لاعب يحصل على 4 أوراق (16 ورقة توزع كاملة على 4 لاعبين).
 */
export function deal(deck: Card[], playerCount: number, cardsEach: number): Card[][] {
  const hands: Card[][] = [];
  for (let p = 0; p < playerCount; p++) {
    hands.push(deck.slice(p * cardsEach, (p + 1) * cardsEach));
  }
  return hands;
}

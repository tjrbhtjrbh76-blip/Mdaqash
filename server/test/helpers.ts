import { Card, Rank, Suit } from '../src/shared/types';
import { createRoom, createSeat, Room, seatIndexOf } from '../src/game/state';
import * as engine from '../src/game/engine';
import { MIN_BET } from '../src/shared/constants';
import { RoomSettings } from '../src/shared/types';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/** بناء يد من نص مثل: 'A A K Q' */
export function hand(str: string): Card[] {
  return str
    .trim()
    .split(/\s+/)
    .map((r, i) => ({ rank: r as Rank, suit: SUITS[i % 4], id: `${r}-${SUITS[i % 4]}-${i}` }));
}

/** بناء مجموعة أوراق كاملة (16) بترتيب التوزيع: المقعد 0 يأخذ أول 4، إلخ */
export function deckOf(h0: string, h1: string, h2: string, h3: string): Card[] {
  return [...hand(h0), ...hand(h1), ...hand(h2), ...hand(h3)];
}

const NAMES = ['نواف', 'أحمد', 'خالد', 'محمد'];

/** غرفة اختبار بأربعة لاعبين وأرصدة قابلة للتخصيص */
export function makeRoom(
  balances: number[] = [5000, 5000, 5000, 5000],
  settings: RoomSettings = { startingBalance: 5000, winGoal: 1_000_000 },
): Room {
  const room = createRoom('TEST-01', NAMES[0], settings);
  for (let i = 1; i < 4; i++) {
    room.seats[i] = createSeat(NAMES[i], settings.startingBalance);
  }
  room.seats.forEach((s, i) => {
    if (s) s.balance = balances[i];
  });
  return room;
}

/**
 * ضبط الموزع بشكل حتمي للاختبارات:
 * beginRound يدوّر الموزع عندما roundNumber > 0، لذا نضبطه على fromDealer
 * ليصبح الفعلي nextPlayer(fromDealer).
 */
export function setNextDealer(room: Room, fromDealer: number): void {
  room.roundNumber = 1;
  room.dealerIndex = fromDealer;
}

/**
 * إنهاء مرحلة المفاوضة في الاختبارات: الكبير يعرض الحد الأدنى لكل هدف
 * والجميع يرد «لا ورق» — النتيجة تصبح مطابقة للسلوك القديم (الكل ينافس بأوراقه).
 */
export function finishNegotiationNoCards(room: Room): void {
  let guard = 0;
  while (room.phase === 'negotiation' && room.negotiation && guard++ < 20) {
    const neg = room.negotiation;
    if (neg.currentOffer === null) {
      engine.makeOffer(room, neg.bigSeatIndex, MIN_BET);
    } else {
      const targetIdx = seatIndexOf(room, neg.order[neg.currentIndex]);
      engine.respond(room, targetIdx, 'no_cards');
    }
  }
}
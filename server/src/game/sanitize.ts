import { ClientNegotiationState, ClientPlayerView, ClientRoomState } from '../shared/types';
import { currentTurnSeatIndex } from './engine';
import { Room } from './state';

/**
 * تنقية حالة الغرفة قبل إرسالها لعميل معيّن.
 *
 * قواعد الخصوصية (Server-Authoritative):
 * - أوراق اللاعب ترسل له وحده فقط.
 * - أوراق الآخرين لا ترسل أبدًا — فقط عددها.
 * - عند النتيجة، تُكشف أوراق الداخلين فقط عبر result.hands.
 */
export function toClientState(room: Room, forPlayerId: string): ClientRoomState {
  const players: (ClientPlayerView | null)[] = room.seats.map((seat, i) => {
    if (!seat) return null;
    return {
      id: seat.id,
      name: seat.name,
      seatIndex: i,
      balance: seat.balance,
      connected: seat.connected,
      currentBet: seat.currentBet,
      folded: seat.folded,
      hasActed: seat.hasActed,
      cardCount: seat.cards.length,
      cards: seat.id === forPlayerId ? seat.cards : null,
      lastDelta: seat.lastDelta,
    };
  });

  return {
    code: room.code,
    phase: room.phase,
    roundNumber: room.roundNumber,
    players,
    dealerIndex: room.dealerIndex,
    turnIndex: currentTurnSeatIndex(room),
    pot: room.pot,
    settings: room.settings,
    ownerId: room.ownerId,
    result: room.result,
    finalWinnerId: room.finalWinnerId,
    countdownEndsAt: room.countdownEndsAt,
    negotiation: toClientNegotiation(room, forPlayerId),
    youId: forPlayerId,
  };
}

/**
 * بناء حالة المفاوضة لعميل معيّن.
 * قواعد الخصوصية: الاختيارات المسبقة (pendingResponses) خاصة بصاحبها فقط —
 * لا يرى الكبير ولا باقي اللاعبين اختيارًا مسبقًا قبل تطبيقه، بينما السجل المكتمل يراه الجميع.
 */
function toClientNegotiation(room: Room, forPlayerId: string): ClientNegotiationState | null {
  const neg = room.negotiation;
  if (!neg) return null;
  const big = room.seats[neg.bigSeatIndex];
  return {
    bigPlayerId: neg.bigPlayerId,
    bigPlayerName: big?.name ?? '',
    order: neg.order,
    currentIndex: neg.currentIndex,
    highestEntry: neg.highestEntry,
    remainingBudget: neg.remainingBudget,
    currentTargetId: neg.currentIndex < neg.order.length ? neg.order[neg.currentIndex] : null,
    currentOffer: neg.currentOffer,
    log: neg.log,
    myPendingResponse: neg.pendingResponses[forPlayerId] ?? null,
  };
}
import { randomUUID } from 'crypto';
import { PLAYER_COUNT } from '../shared/constants';
import { Card, NegotiationLogEntry, NegotiationResponse, Phase, RoomSettings, RoundResult } from '../shared/types';

/**
 * الحالة الداخلية الكاملة للغرفة — توجد على السيرفر فقط.
 * لا ترسل أبدًا للعميل كما هي، بل تمر عبر sanitize.ts أولًا.
 */

export interface Seat {
  /** معرف ثابت للاعب (يستخدم لاستعادة الجلسة بعد الانقطاع) */
  id: string;
  name: string;
  balance: number;
  connected: boolean;
  socketId: string | null;
  cards: Card[];
  /** المبلغ الذي دخل به في الجولة الحالية */
  currentBet: number;
  folded: boolean;
  hasActed: boolean;
  /** صافي ربح/خسارة آخر جولة */
  lastDelta: number | null;
}

/**
 * حالة مرحلة المفاوضة الداخلية (سيرفر فقط).
 * الكبير = صاحب أعلى مبلغ دخول، ويفاوض باقي الداخلين بدءًا من يمينه.
 */
export interface NegotiationState {
  bigPlayerId: string;
  bigSeatIndex: number;
  /** ترتيب المفاوضة بدءًا من يمين الكبير — معرفات اللاعبين المفاوَضين */
  order: string[];
  /** مؤشر اللاعب الجاري التفاوض معه داخل order */
  currentIndex: number;
  /** أعلى سومة (سومة الكبير) = ميزانية المفاوضة الأصلية */
  highestEntry: number;
  /** المتبقي من ميزانية المفاوضة — كل عرض مقبول يُخصم منه */
  remainingBudget: number;
  /** العرض المفتوح حاليًا بانتظار رد الهدف — null يعني بانتظار عرض الكبير */
  currentOffer: number | null;
  /** playerId → قيمة العرض النهائية */
  offers: Record<string, number>;
  /** playerId → الرد النهائي */
  responses: Record<string, NegotiationResponse>;
  /** playerId → اختيار مسبق (يُطبَّق عند وصول الدور) — خاص بصاحبه */
  pendingResponses: Record<string, NegotiationResponse>;
  /** سجل المفاوضات المكتملة بالترتيب — مرئي للجميع */
  log: NegotiationLogEntry[];
}

export interface Room {
  code: string;
  ownerId: string;
  phase: Phase;
  /** 4 مقاعد ثابتة — null يعني مقعد فارغ (في الانتظار فقط) */
  seats: (Seat | null)[];
  dealerIndex: number;
  /** موقع الدور الحالي داخل ترتيب الأدوار (0..3) */
  turnPos: number;
  roundNumber: number;
  pot: number;
  settings: RoomSettings;
  result: RoundResult | null;
  /** حالة المفاوضة — null خارج مرحلة المفاوضة */
  negotiation: NegotiationState | null;
  finalWinnerId: string | null;
  countdownEndsAt: number | null;
  createdAt: number;
  /** مؤقتات المراحل الداخلية (لا ترسل للعميل) */
  timers: Set<NodeJS.Timeout>;
  /** مؤقت دور اللاعب غير المتصل (منفصل حتى لا يُمسح مع مؤقتات المراحل) */
  turnTimer: NodeJS.Timeout | null;
}

export function createSeat(name: string, balance: number): Seat {
  return {
    id: randomUUID(),
    name,
    balance,
    connected: true,
    socketId: null,
    cards: [],
    currentBet: 0,
    folded: false,
    hasActed: false,
    lastDelta: null,
  };
}

export function createRoom(code: string, ownerName: string, settings: RoomSettings): Room {
  const seats: (Seat | null)[] = new Array(PLAYER_COUNT).fill(null);
  const owner = createSeat(ownerName, settings.startingBalance);
  seats[0] = owner;
  return {
    code,
    ownerId: owner.id,
    phase: 'waiting',
    seats,
    dealerIndex: 0,
    turnPos: 0,
    roundNumber: 0,
    pot: 0,
    settings,
    result: null,
    negotiation: null,
    finalWinnerId: null,
    countdownEndsAt: null,
    createdAt: Date.now(),
    timers: new Set(),
    turnTimer: null,
  };
}

/** عدد اللاعبين الجالسين (متصلين أو لا) */
export function seatedCount(room: Room): number {
  return room.seats.filter((s) => s !== null).length;
}

/** هل الغرفة مكتملة (4 لاعبين) */
export function isFull(room: Room): boolean {
  return seatedCount(room) === PLAYER_COUNT;
}

/** إيجاد مقعد لاعب بمعرفه */
export function seatIndexOf(room: Room, playerId: string): number {
  return room.seats.findIndex((s) => s !== null && s.id === playerId);
}

/** إيجاد مقعد لاعب بمعرف السوكت */
export function seatIndexBySocket(room: Room, socketId: string): number {
  return room.seats.findIndex((s) => s !== null && s.socketId === socketId);
}

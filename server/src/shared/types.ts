/**
 * الأنواع المشتركة بين السيرفر والواجهة (عقد الاتصال Contract).
 * الواجهة تعرض هذه الحالة فقط — لا تثق بأي حسابات من جهة العميل.
 */

/** أنواع الأوراق: لا توجد مجموعات (Suits) مؤثرة في اللعب — فقط للعرض الجمالي */
export type Rank = 'A' | 'K' | 'Q' | 'J';
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export interface Card {
  rank: Rank;
  suit: Suit;
  /** معرف فريد مثل A-spades */
  id: string;
}

/** مراحل اللعبة */
/** مراحل اللعبة */
export type Phase =
  | 'waiting'    // بانتظار اكتمال 4 لاعبين
  | 'countdown'  // اكتمل العدد — عد تنازلي
  | 'dealing'    // توزيع الأوراق (أنيميشن)
  | 'betting'    // مرحلة الدخول/المراهنة
  | 'negotiation' // مرحلة المفاوضة (الكبير يفاوض الداخلين)
  | 'showdown'   // كشف النتيجة
  | 'gameover';  // انتهت اللعبة بوصول لاعب لهدف الفوز

export interface RoomSettings {
  /** رصيد البداية لكل لاعب */
  startingBalance: number;
  /** هدف الفوز — مضاعفات المليون */
  winGoal: number;
}

/** يد مكشوفة عند النتيجة */
export interface RevealedHand {
  playerId: string;
  playerName: string;
  entered: boolean;
  cards: Card[];
  handLabel: string;
}

export interface StandingEntry {
  playerId: string;
  name: string;
  balance: number;
}

/* ---------------- المفاوضة ---------------- */

/** رد اللاعب المفاوَض على عرض الكبير: قبول العرض والخروج، أو «لا ورق» (تحدٍّ بالأوراق) */
export type NegotiationResponse = 'accept' | 'no_cards';

/** سطر مكتمل في سجل المفاوضات — مرئي لجميع اللاعبين لحظيًا */
export interface NegotiationLogEntry {
  /** اللاعب المفاوَض */
  playerId: string;
  playerName: string;
  /** قيمة العرض — 0 تعني نفد رصيد المفاوضة فأصبح «لا ورق» تلقائيًا */
  offer: number;
  response: NegotiationResponse;
  /** طُبّق تلقائيًا (اختيار مسبق / نفاد الرصيد / انقطاع) */
  auto: boolean;
}

/** حالة المفاوضة كما تُرسل للعميل (مُنقّحة — الاختيارات المسبقة للآخرين مخفية) */
export interface ClientNegotiationState {
  bigPlayerId: string;
  bigPlayerName: string;
  /** ترتيب المفاوضة بدءًا من يمين الكبير — معرفات اللاعبين المفاوَضين */
  order: string[];
  currentIndex: number;
  /** أعلى سومة = ميزانية المفاوضة الأصلية */
  highestEntry: number;
  /** المبلغ المتبقي من سومة الكبير المخصصة للعروض */
  remainingBudget: number;
  /** اللاعب الجاري التفاوض معه الآن */
  currentTargetId: string | null;
  /** قيمة العرض المفتوح بانتظار الرد — null يعني بانتظار الكبير أن يقدم عرضه */
  currentOffer: number | null;
  /** سجل المفاوضات المكتملة — يراه الجميع */
  log: NegotiationLogEntry[];
  /** ردي المسبق المحفوظ (يُرسل لصاحبه فقط) */
  myPendingResponse: NegotiationResponse | null;
}

export interface RoundResult {
  roundNumber: number;
  pot: number;
  winnerIds: string[];
  /** نصيب الفائز الواحد من الجائزة */
  winShare: number;
  hands: RevealedHand[];
  /** صافي الربح/الخسارة لكل لاعب في هذه الجولة */
  deltas: Record<string, number>;
  standings: StandingEntry[];
  /** هل انتهت اللعبة بهذه الجولة */
  goalReached: boolean;
}

/** عرض اللاعب كما يرسل للعميل (مُنقّح — بدون أوراق الآخرين) */
export interface ClientPlayerView {
  id: string;
  name: string;
  seatIndex: number;
  balance: number;
  connected: boolean;
  /** المبلغ الذي دخل به في الجولة الحالية */
  currentBet: number;
  folded: boolean;
  hasActed: boolean;
  cardCount: number;
  /** أوراق اللاعب — ترسل فقط لصاحبها، وإلا null */
  cards: Card[] | null;
  /** صافي ربح/خسارة آخر جولة */
  lastDelta: number | null;
}

export interface ClientRoomState {
  code: string;
  phase: Phase;
  roundNumber: number;
  players: (ClientPlayerView | null)[];
  dealerIndex: number;
  /** مقعد صاحب الدور الحالي أثناء المراهنة */
  turnIndex: number | null;
  pot: number;
  settings: RoomSettings;
  ownerId: string;
  result: RoundResult | null;
  finalWinnerId: string | null;
  countdownEndsAt: number | null;
  /** حالة المفاوضة — null خارج مرحلة المفاوضة/النتيجة */
  negotiation: ClientNegotiationState | null;
  /** معرف اللاعب صاحب هذا الاتصال */
  youId: string;
}

/** ردود السيرفر على الأوامر */
export interface AckOk<T = undefined> {
  ok: true;
  data?: T;
}
export interface AckErr {
  ok: false;
  error: string;
  message: string;
}
export type Ack<T = undefined> = AckOk<T> | AckErr;

/** أكواد الأخطاء — ترجماتها العربية في الواجهة */
export type ErrorCode =
  | 'NETWORK'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NAME_REQUIRED'
  | 'NOT_YOUR_TURN'
  | 'INVALID_AMOUNT'
  | 'MIN_BET'
  | 'INSUFFICIENT_BALANCE'
  | 'FORCED_MUST_ENTER'
  | 'BAD_PHASE'
  | 'NOT_OWNER'
  | 'INVALID_SETTINGS'
  | 'NOT_IN_ROOM'
  | 'SESSION_EXPIRED'
  | 'NOT_BIG_PLAYER'
  | 'EXCEEDS_BUDGET'
  | 'NO_OFFER'
  | 'INVALID_RESPONSE';

import { randomInt } from 'crypto';
import { CARDS_PER_PLAYER, MIN_BET, PLAYER_COUNT } from '../shared/constants';
import { Card, NegotiationResponse, RevealedHand, RoundResult, StandingEntry } from '../shared/types';
import { forcedEntryAmount, validateEntry, validateOffer } from './betting';
import { createDeck, deal, shuffle } from './deck';
import { nextPlayer, rightOfDealer, turnOrderOf } from './dealer';
import { compareHands, evaluateHand } from './handEvaluator';
import { Room, seatIndexOf } from './state';

/**
 * محرك اللعبة — كل قواعد «مداقش» هنا (Server-Authoritative).
 * دوال نقية تعمل على كائن Room مباشرة، بدون أي اعتماد على الشبكة أو الواجهة.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const fail = (error: string): ActionResult => ({ ok: false, error });
const success: ActionResult = { ok: true };

/** مقعد صاحب الدور الحالي أثناء المراهنة (أو null إذا انتهت الأدوار) */
export function currentTurnSeatIndex(room: Room): number | null {
  if (room.phase !== 'betting') return null;
  if (room.turnPos < 0 || room.turnPos >= PLAYER_COUNT) return null;
  return turnOrderOf(room.dealerIndex)[room.turnPos];
}

/** هل هذا المقعد هو اللاعب المُجبَر على الدخول (يمين الموزع)؟ */
export function isForcedSeat(room: Room, seatIndex: number): boolean {
  return seatIndex === rightOfDealer(room.dealerIndex);
}

/**
 * بدء جولة جديدة:
 * - تدوير الموزع (بعد الجولة الأولى)
 * - تصفير الرهانات
 * - خلط وتوزيع 16 ورقة على السيرفر
 * - المرحلة تصبح 'dealing' لأنيميشن التوزيع، ثم تُستدعى startBetting
 *
 * @param deckOverride للاختبارات فقط — تمرير مجموعة أوراق محددة مسبقًا
 */
export function beginRound(room: Room, deckOverride?: Card[]): void {
  if (room.roundNumber > 0) {
    room.dealerIndex = nextPlayer(room.dealerIndex);
  } else {
    room.dealerIndex = randomInt(PLAYER_COUNT);
  }
  room.roundNumber += 1;
  room.pot = 0;
  room.result = null;
  room.negotiation = null;
  room.countdownEndsAt = null;
  room.turnPos = -1;

  const deck = deckOverride ?? shuffle(createDeck());
  const hands = deal(deck, PLAYER_COUNT, CARDS_PER_PLAYER);

  room.seats.forEach((seat, i) => {
    if (!seat) return;
    seat.cards = hands[i];
    seat.currentBet = 0;
    seat.folded = false;
    seat.hasActed = false;
    seat.lastDelta = null;
  });

  room.phase = 'dealing';
}

/** الانتقال من توزيع الأوراق إلى مرحلة المراهنة */
export function startBetting(room: Room): void {
  if (room.phase !== 'dealing') return;
  room.phase = 'betting';
  room.turnPos = -1;
  advanceTurn(room);
}

/** دخول لاعب بمبلغ معيّن — مع كل التحققات على السيرفر */
export function enter(room: Room, seatIndex: number, amount: number): ActionResult {
  if (room.phase !== 'betting') return fail('BAD_PHASE');
  if (currentTurnSeatIndex(room) !== seatIndex) return fail('NOT_YOUR_TURN');
  const seat = room.seats[seatIndex];
  if (!seat) return fail('BAD_PHASE');

  const forced = isForcedSeat(room, seatIndex);
  const validation = validateEntry(amount, seat.balance, forced);
  if (!validation.ok) return fail(validation.error!);

  applyEnter(room, seatIndex, amount);
  return success;
}

/** انسحاب لاعب (عدم الدخول) — غير متاح للاعب المُجبَر يمين الموزع */
export function fold(room: Room, seatIndex: number): ActionResult {
  if (room.phase !== 'betting') return fail('BAD_PHASE');
  if (currentTurnSeatIndex(room) !== seatIndex) return fail('NOT_YOUR_TURN');
  if (isForcedSeat(room, seatIndex)) return fail('FORCED_MUST_ENTER');

  applyFold(room, seatIndex);
  return success;
}

/**
 * الإجراء التلقائي للاعب غير المتصل عند انتهاء مهلته:
 * - المُجبَر: يدخل بالحد الأدنى 500 (أو بكل رصيده إن كان أقل)
 * - غير المُجبَر: ينسحب
 */
export function autoAct(room: Room, seatIndex: number): ActionResult {
  if (room.phase !== 'betting') return fail('BAD_PHASE');
  if (currentTurnSeatIndex(room) !== seatIndex) return fail('NOT_YOUR_TURN');
  const seat = room.seats[seatIndex];
  if (!seat) return fail('BAD_PHASE');

  if (isForcedSeat(room, seatIndex)) {
    applyEnter(room, seatIndex, forcedEntryAmount(seat.balance));
  } else {
    applyFold(room, seatIndex);
  }
  return success;
}

/**
 * تقديم الدور — مع تخطي تلقائي فوري للمقاعد المفلسة:
 * المُجبَر المفلس يدخل All-in تلقائيًا، وغير المُجبَر المفلس ينسحب تلقائيًا،
 * حتى لا يتوقف الدور على لاعب لا يملك أي خيار.
 */
function advanceTurn(room: Room): void {
  room.turnPos += 1;
  while (room.turnPos < PLAYER_COUNT) {
    const idx = turnOrderOf(room.dealerIndex)[room.turnPos];
    const seat = room.seats[idx];
    if (!seat) {
      room.turnPos += 1;
      continue;
    }
    if (seat.balance >= MIN_BET) return; // لاعب حقيقي سيقرر
    // لاعب مفلس: إجراء تلقائي
    if (isForcedSeat(room, idx)) {
      const amount = forcedEntryAmount(seat.balance);
      seat.balance -= amount;
      seat.currentBet = amount;
      seat.hasActed = true;
      room.pot += amount;
    } else {
      seat.folded = true;
      seat.hasActed = true;
    }
    room.turnPos += 1;
  }
  // اكتملت أدوار المراهنة — تبدأ مرحلة المفاوضة (أو الحسم مباشرة إن لم يدخل إلا لاعب واحد)
  startNegotiation(room);
}

/**
 * حسم الجولة على السيرفر:
 * - الفائز هو صاحب أقوى يد بين اللاعبين الداخلين
 * - التعادل التام: تقسيم الجائزة بالتساوي (والباقي لأول فائز في ترتيب الدور)
 * - تحديث الأرصدة وحساب صافي الربح/الخسارة
 * - فحص الوصول لهدف الفوز
 */
export function resolveRound(room: Room): void {
  const order = turnOrderOf(room.dealerIndex);
  const neg = room.negotiation;
  // من قبل عرض الكبير خرج من المنافسة باتفاق — لا ينافس على الجائزة
  const enteredIdxs = order.filter((i) => {
    const s = room.seats[i];
    return s !== null && s.hasActed && !s.folded && neg?.responses[s.id] !== 'accept';
  });

  // تحديد الفائز/الفائزين (تعادل تام ممكن)
  let winnerIdxs: number[] = [];
  if (enteredIdxs.length === 1) {
    winnerIdxs = [enteredIdxs[0]];
  } else if (enteredIdxs.length > 1) {
    let best = enteredIdxs[0];
    winnerIdxs = [best];
    for (const i of enteredIdxs.slice(1)) {
      const cmp = compareHands(room.seats[i]!.cards, room.seats[best]!.cards);
      if (cmp > 0) {
        best = i;
        winnerIdxs = [i];
      } else if (cmp === 0) {
        winnerIdxs.push(i);
      }
    }
  }

  // توزيع الجائزة
  const share = winnerIdxs.length > 0 ? Math.floor(room.pot / winnerIdxs.length) : 0;
  const remainder = room.pot - share * winnerIdxs.length;
  const winnings = new Map<number, number>();
  winnerIdxs.forEach((idx, k) => {
    const amount = share + (k === 0 ? remainder : 0);
    winnings.set(idx, amount);
    room.seats[idx]!.balance += amount;
  });

  // تسوية المفاوضة: الكبير يدفع قيمة كل عرض مقبول من رصيده لصاحبه (تحويل صفري المجموع)
  const negDeltas = new Map<number, number>();
  if (neg) {
    for (const entry of neg.log) {
      if (entry.response !== 'accept' || entry.offer <= 0) continue;
      const toIdx = seatIndexOf(room, entry.playerId);
      if (toIdx === -1) continue;
      room.seats[toIdx]!.balance += entry.offer;
      room.seats[neg.bigSeatIndex]!.balance -= entry.offer;
      negDeltas.set(toIdx, (negDeltas.get(toIdx) ?? 0) + entry.offer);
      negDeltas.set(neg.bigSeatIndex, (negDeltas.get(neg.bigSeatIndex) ?? 0) - entry.offer);
    }
  }

  // صافي الربح/الخسارة لكل لاعب
  const deltas: Record<string, number> = {};
  room.seats.forEach((seat, i) => {
    if (!seat) return;
    const delta = (winnings.get(i) ?? 0) - seat.currentBet + (negDeltas.get(i) ?? 0);
    seat.lastDelta = delta;
    deltas[seat.id] = delta;
  });

  // كشف أوراق الداخلين فقط
  const hands: RevealedHand[] = order
    .map((i) => room.seats[i])
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((s) => {
      const entered = s.hasActed && !s.folded;
      return {
        playerId: s.id,
        playerName: s.name,
        entered,
        cards: entered ? s.cards : [],
        handLabel: entered ? evaluateHand(s.cards).label : '',
      };
    });

  const standings: StandingEntry[] = room.seats
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((s) => ({ playerId: s.id, name: s.name, balance: s.balance }))
    .sort((a, b) => b.balance - a.balance);

  const goalReached = standings.length > 0 && standings[0].balance >= room.settings.winGoal;

  room.result = {
    roundNumber: room.roundNumber,
    pot: room.pot,
    winnerIds: winnerIdxs.map((i) => room.seats[i]!.id),
    winShare: share,
    hands,
    deltas,
    standings,
    goalReached,
  } satisfies RoundResult;

  if (goalReached) {
    room.phase = 'gameover';
    room.finalWinnerId = standings[0].playerId;
  } else {
    room.phase = 'showdown';
  }
}

/** إعادة اللعبة من الصفر بعد انتهائها (نفس اللاعبين، أرصدة جديدة) */
export function resetForNewGame(room: Room): void {
  room.seats.forEach((seat) => {
    if (!seat) return;
    seat.balance = room.settings.startingBalance;
    seat.cards = [];
    seat.currentBet = 0;
    seat.folded = false;
    seat.hasActed = false;
    seat.lastDelta = null;
  });
  room.roundNumber = 0;
  room.dealerIndex = 0;
  room.turnPos = -1;
  room.pot = 0;
  room.result = null;
  room.negotiation = null;
  room.finalWinnerId = null;
}

/* ---------------- مرحلة المفاوضة ---------------- */

/**
 * بدء مرحلة المفاوضة بعد اكتمال دخول اللاعبين:
 * - الكبير = صاحب أعلى مبلغ دخول (عند التعادل: الأسبق في ترتيب الدور)
 * - ترتيب المفاوضة يبدأ من يمين الكبير ويدور دائريًا (نفس منطق turnOrderOf)
 * - إذا دخل لاعب واحد فقط (أو لا أحد) تُتخطى المفاوضة مباشرة إلى الحسم
 */
export function startNegotiation(room: Room): void {
  const turnOrder = turnOrderOf(room.dealerIndex);
  const enteredIdxs = turnOrder.filter((i) => {
    const s = room.seats[i];
    return s !== null && s.hasActed && !s.folded;
  });

  if (enteredIdxs.length < 2) {
    resolveRound(room);
    return;
  }

  let bigIdx = enteredIdxs[0];
  for (const i of enteredIdxs.slice(1)) {
    if (room.seats[i]!.currentBet > room.seats[bigIdx]!.currentBet) bigIdx = i;
  }
  const big = room.seats[bigIdx]!;

  // من يمين الكبير بشكل دائري — الداخلون فقط دون الكبير نفسه
  const order = turnOrderOf(bigIdx)
    .filter((i) => i !== bigIdx && enteredIdxs.includes(i))
    .map((i) => room.seats[i]!.id);

  room.negotiation = {
    bigPlayerId: big.id,
    bigSeatIndex: bigIdx,
    order,
    currentIndex: 0,
    highestEntry: big.currentBet,
    remainingBudget: big.currentBet,
    currentOffer: null,
    offers: {},
    responses: {},
    pendingResponses: {},
    log: [],
  };
  room.phase = 'negotiation';

  // سومة الكبير قد تكون أقل من 500 (All-in للمُجبَر المفلس) — حينها الجميع «لا ورق» تلقائيًا
  settleAutoNoCards(room);
  maybeFinishNegotiation(room);
}

/** مقعد اللاعب المنتظَر منه إجراء الآن: الكبير (لتقديم عرض) أو الهدف (للرد) */
export function negotiationActorSeatIndex(room: Room): number | null {
  if (room.phase !== 'negotiation' || !room.negotiation) return null;
  const neg = room.negotiation;
  if (neg.currentIndex >= neg.order.length) return null;
  if (neg.currentOffer === null) return neg.bigSeatIndex;
  return seatIndexOf(room, neg.order[neg.currentIndex]);
}

/** الكبير يقدم عرضًا للاعب الجاري التفاوض معه — مع كل التحققات على السيرفر */
export function makeOffer(room: Room, seatIndex: number, amount: number): ActionResult {
  if (room.phase !== 'negotiation') return fail('BAD_PHASE');
  const neg = room.negotiation;
  if (!neg) return fail('BAD_PHASE');
  if (seatIndex !== neg.bigSeatIndex) return fail('NOT_BIG_PLAYER');
  const targetId = currentNegotiationTargetId(room);
  if (!targetId) return fail('BAD_PHASE');
  if (neg.currentOffer !== null) return fail('BAD_PHASE'); // يوجد عرض مفتوح بانتظار الرد

  const validation = validateOffer(amount, neg.remainingBudget);
  if (!validation.ok) return fail(validation.error!);

  neg.currentOffer = amount;
  // إن كان للهدف اختيار مسبق صالح يُطبَّق فورًا ويظهر في السجل
  const pending = neg.pendingResponses[targetId];
  if (pending) {
    finalizeResponse(room, targetId, amount, pending, true);
    settleAutoNoCards(room);
    maybeFinishNegotiation(room);
  }
  return success;
}

/** رد اللاعب المفاوَض على العرض المفتوح: قبول أو «لا ورق» */
export function respond(room: Room, seatIndex: number, response: NegotiationResponse): ActionResult {
  if (room.phase !== 'negotiation') return fail('BAD_PHASE');
  const neg = room.negotiation;
  if (!neg) return fail('BAD_PHASE');
  const targetId = currentNegotiationTargetId(room);
  if (!targetId) return fail('BAD_PHASE');
  const seat = room.seats[seatIndex];
  if (!seat || seat.id !== targetId) return fail('NOT_YOUR_TURN');
  if (neg.currentOffer === null) return fail('NO_OFFER');

  finalizeResponse(room, targetId, neg.currentOffer, response, false);
  settleAutoNoCards(room);
  maybeFinishNegotiation(room);
  return success;
}

/**
 * اختيار مسبق (Pre-selection): اللاعب الذي لم يصل دوره يحفظ موقفه مسبقًا،
 * ويُطبَّق تلقائيًا عند وصول الدور إليه إن قدّم الكبير عرضًا. response=null يلغي الاختيار.
 */
export function preselect(room: Room, seatIndex: number, response: NegotiationResponse | null): ActionResult {
  if (room.phase !== 'negotiation') return fail('BAD_PHASE');
  const neg = room.negotiation;
  if (!neg) return fail('BAD_PHASE');
  const seat = room.seats[seatIndex];
  if (!seat) return fail('BAD_PHASE');
  if (seatIndex === neg.bigSeatIndex) return fail('BAD_PHASE'); // الكبير لا يختار ردًا
  if (!neg.order.includes(seat.id)) return fail('BAD_PHASE'); // ليس ضمن المفاوضة (منسحب)
  if (neg.responses[seat.id]) return fail('BAD_PHASE'); // تم الرد نهائيًا
  // الهدف الحالي وعنده عرض مفتوح يرد مباشرة بدل الاختيار المسبق
  if (currentNegotiationTargetId(room) === seat.id && neg.currentOffer !== null) {
    return fail('BAD_PHASE');
  }

  if (response === null) {
    delete neg.pendingResponses[seat.id];
  } else {
    neg.pendingResponses[seat.id] = response;
  }
  return success;
}

/**
 * الإجراء التلقائي أثناء المفاوضة للاعب غير المتصل بعد انتهاء مهلته:
 * - الكبير غير المتصل: يقدم عرضًا تلقائيًا بالحد الأدنى 500
 * - الهدف غير المتصل: «لا ورق» تلقائيًا (لا تُدفع أموال نيابة عنه)
 */
export function autoNegotiationAct(room: Room): ActionResult {
  if (room.phase !== 'negotiation') return fail('BAD_PHASE');
  const neg = room.negotiation;
  if (!neg) return fail('BAD_PHASE');
  const targetId = currentNegotiationTargetId(room);
  if (!targetId) return fail('BAD_PHASE');

  if (neg.currentOffer === null) {
    const amount = Math.min(MIN_BET, neg.remainingBudget);
    if (amount < MIN_BET) return fail('BAD_PHASE'); // لا يحدث عمليًا — settleAutoNoCards يسبق
    neg.currentOffer = amount;
    const pending = neg.pendingResponses[targetId];
    if (pending) {
      finalizeResponse(room, targetId, amount, pending, true);
    } else {
      // إن كان الهدف أيضًا غير متصل: «لا ورق» فوري حتى لا تتوقف الجولة
      const tIdx = seatIndexOf(room, targetId);
      const tSeat = tIdx >= 0 ? room.seats[tIdx] : null;
      if (tSeat && !tSeat.connected) {
        finalizeResponse(room, targetId, amount, 'no_cards', true);
      }
    }
  } else {
    finalizeResponse(room, targetId, neg.currentOffer, 'no_cards', true);
  }
  settleAutoNoCards(room);
  maybeFinishNegotiation(room);
  return success;
}
/* ---------------- الدوال الداخلية ---------------- */

function applyEnter(room: Room, seatIndex: number, amount: number): void {
  const seat = room.seats[seatIndex]!;
  seat.balance -= amount;
  seat.currentBet = amount;
  seat.hasActed = true;
  room.pot += amount;
  advanceTurn(room);
}

function applyFold(room: Room, seatIndex: number): void {
  const seat = room.seats[seatIndex]!;
  seat.folded = true;
  seat.hasActed = true;
  advanceTurn(room);
}

/* ---------------- المفاوضة (دوال داخلية) ---------------- */

/** اللاعب الجاري التفاوض معه حاليًا (أو null إذا انتهت القائمة) */
function currentNegotiationTargetId(room: Room): string | null {
  const neg = room.negotiation;
  if (!neg || neg.currentIndex >= neg.order.length) return null;
  return neg.order[neg.currentIndex];
}

/** تثبيت رد لاعب: تسجيل العرض والرد في السجل، خصم المقبول من الميزانية، وتقديم المؤشر */
function finalizeResponse(
  room: Room,
  targetId: string,
  offer: number,
  response: NegotiationResponse,
  auto: boolean,
): void {
  const neg = room.negotiation!;
  neg.offers[targetId] = offer;
  neg.responses[targetId] = response;
  if (response === 'accept') neg.remainingBudget -= offer;
  const idx = seatIndexOf(room, targetId);
  neg.log.push({
    playerId: targetId,
    playerName: idx >= 0 ? room.seats[idx]!.name : '',
    offer,
    response,
    auto,
  });
  delete neg.pendingResponses[targetId];
  neg.currentOffer = null;
  neg.currentIndex += 1;
}

/** إذا نفد رصيد المفاوضة (أقل من الحد الأدنى للعرض) يصبح كل من تبقى «لا ورق» تلقائيًا */
function settleAutoNoCards(room: Room): void {
  const neg = room.negotiation;
  if (!neg) return;
  while (neg.currentIndex < neg.order.length && neg.remainingBudget < MIN_BET) {
    const targetId = neg.order[neg.currentIndex];
    finalizeResponse(room, targetId, 0, 'no_cards', true);
  }
}

/** نهاية المفاوضة: عند معالجة جميع المفاوَضين تنتقل اللعبة إلى الحسم */
function maybeFinishNegotiation(room: Room): void {
  const neg = room.negotiation;
  if (!neg) return;
  if (neg.currentIndex >= neg.order.length) {
    resolveRound(room);
  }
}
import { describe, expect, it } from 'vitest';
import * as engine from '../src/game/engine';
import { toClientState } from '../src/game/sanitize';
import { deckOf, makeRoom, setNextDealer } from './helpers';

/**
 * اختبارات مرحلة المفاوضة — الكبير، الترتيب من يمينه، العروض، الردود، الميزانية.
 * setNextDealer(room, 3) → الموزع 0، ترتيب الدخول: 1 → 2 → 3 → 0.
 */

/** بدء جولة ودخول اللاعبين بالمبالغ المعطاة (مفهرسة بالمقعد، 'fold' = انسحاب) */
function startWithBets(
  room: ReturnType<typeof makeRoom>,
  deck: ReturnType<typeof deckOf>,
  bets: (number | 'fold')[],
) {
  engine.beginRound(room, deck);
  engine.startBetting(room);
  for (const idx of [1, 2, 3, 0]) {
    const b = bets[idx];
    if (b === 'fold') engine.fold(room, idx);
    else if (b > 0) engine.enter(room, idx, b);
  }
}

/** الإعداد القياسي: seat2 هو الكبير (2000)، ترتيب المفاوضة [3, 0, 1] */
function startStandard() {
  const room = makeRoom();
  setNextDealer(room, 3);
  startWithBets(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'), [1000, 500, 2000, 1500]);
  return room;
}

describe('بدء المفاوضة وتحديد الكبير', () => {
  it('الكبير = أعلى مبلغ دخول، والترتيب يبدأ من يمينه بشكل دائري', () => {
    const room = startStandard();
    expect(room.phase).toBe('negotiation');

    const neg = room.negotiation!;
    expect(neg.bigSeatIndex).toBe(2);
    expect(neg.bigPlayerId).toBe(room.seats[2]!.id);
    expect(neg.highestEntry).toBe(2000);
    expect(neg.remainingBudget).toBe(2000);
    // يمين المقعد 2: [3, 0, 1] — نفس منطق الترتيب الدائري للموزع
    expect(neg.order).toEqual([room.seats[3]!.id, room.seats[0]!.id, room.seats[1]!.id]);
    expect(neg.currentIndex).toBe(0);
    expect(neg.log).toHaveLength(0);
  });

  it('عند تعادل أعلى مبلغ: الكبير هو الأسبق في ترتيب الدور', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    startWithBets(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'), [1000, 1000, 500, 500]);
    // seat1 و seat0 متعادلان بـ 1000 — seat1 أسبق في ترتيب الدور
    expect(room.negotiation!.bigSeatIndex).toBe(1);
    // يمين المقعد 1: [2, 3, 0]
    expect(room.negotiation!.order).toEqual([
      room.seats[2]!.id,
      room.seats[3]!.id,
      room.seats[0]!.id,
    ]);
  });

  it('تُتخطى المفاوضة إذا دخل لاعب واحد فقط', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    startWithBets(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'), [
      'fold',
      500,
      'fold',
      'fold',
    ]);
    expect(room.phase).toBe('showdown');
    expect(room.negotiation).toBeNull();
    expect(room.result!.winnerIds).toEqual([room.seats[1]!.id]);
  });

  it('المنسحبون لا يدخلون في ترتيب المفاوضة', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    startWithBets(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'), [
      'fold',
      500,
      2000,
      1500,
    ]);
    // الكبير seat2 — المفاوَضون: seat3 فقط (seat0 منسحب، seat1 دخل لكنه... )
    // seat1 دخل بـ 500 أيضًا — الترتيب من يمين 2: [3, 1] (0 منسحب)
    expect(room.negotiation!.order).toEqual([room.seats[3]!.id, room.seats[1]!.id]);
  });
});

describe('التحقق من قيمة العرض (Server Authority)', () => {
  it('مضاعفات 500، حد أدنى 500، ولا يتجاوز الميزانية المتبقية', () => {
    const room = startStandard();
    expect(engine.makeOffer(room, 1, 500).error).toBe('NOT_BIG_PLAYER');
    expect(engine.makeOffer(room, 2, 700).error).toBe('INVALID_AMOUNT');
    expect(engine.makeOffer(room, 2, 0).error).toBe('MIN_BET');
    expect(engine.makeOffer(room, 2, 2500).error).toBe('EXCEEDS_BUDGET'); // الميزانية 2000
    expect(engine.makeOffer(room, 2, 1000).ok).toBe(true);
  });

  it('لا يمكن تقديم عرض ثانٍ قبل الرد على الأول', () => {
    const room = startStandard();
    expect(engine.makeOffer(room, 2, 500).ok).toBe(true);
    expect(engine.makeOffer(room, 2, 500).error).toBe('BAD_PHASE');
  });

  it('الرد بدون عرض مفتوح مرفوض، والرد من غير الهدف مرفوض', () => {
    const room = startStandard();
    expect(engine.respond(room, 3, 'accept').error).toBe('NO_OFFER');
    expect(engine.makeOffer(room, 2, 500).ok).toBe(true);
    expect(engine.respond(room, 0, 'accept').error).toBe('NOT_YOUR_TURN'); // الهدف الحالي هو seat3
  });
});

describe('القبول و«لا ورق» والتسوية المالية', () => {
  it('قبول العرض: يُخصم من الميزانية، يخرج من المنافسة، ويُحوَّل المبلغ عند الحسم', () => {
    const room = startStandard(); // الكبير seat2=2000، الترتيب [3,0,1]
    const neg = room.negotiation!;

    expect(engine.makeOffer(room, 2, 1000).ok).toBe(true); // لـ seat3
    expect(engine.respond(room, 3, 'accept').ok).toBe(true);
    expect(neg.remainingBudget).toBe(1000);
    expect(neg.log[0]).toMatchObject({
      playerId: room.seats[3]!.id,
      offer: 1000,
      response: 'accept',
      auto: false,
    });

    expect(engine.makeOffer(room, 2, 500).ok).toBe(true); // لـ seat0
    expect(engine.respond(room, 0, 'no_cards').ok).toBe(true);
    expect(neg.remainingBudget).toBe(1000); // «لا ورق» لا يخصم من الميزانية

    expect(engine.makeOffer(room, 2, 500).ok).toBe(true); // لـ seat1
    expect(engine.respond(room, 1, 'no_cards').ok).toBe(true);

    // انتهت المفاوضة → الحسم
    expect(room.phase).toBe('showdown');
    // seat3 قبل وخرج — الفائز من بين 0,1,2: seat0 برباعي آكه
    expect(room.result!.winnerIds).toEqual([room.seats[0]!.id]);

    // التسوية: الجائزة 5000 لـ seat0، وتحويل 1000 من الكبير إلى seat3
    expect(room.seats[0]!.balance).toBe(5000 - 1000 + 5000);
    expect(room.seats[1]!.balance).toBe(5000 - 500);
    expect(room.seats[2]!.balance).toBe(5000 - 2000 - 1000); // دفع العرض من رصيده
    expect(room.seats[3]!.balance).toBe(5000 - 1500 + 1000); // استلم العرض
    expect(room.result!.deltas[room.seats[3]!.id]).toBe(-500); // -1500 + 1000
    expect(room.result!.deltas[room.seats[2]!.id]).toBe(-3000); // -2000 - 1000

    // حفظ المجموع الكلي (صفري)
    const total = room.seats.reduce((sum, s) => sum + (s?.balance ?? 0), 0);
    expect(total).toBe(20_000);
  });

  it('«لا ورق» يبقي اللاعب منافسًا ويحسم بقوة ورقه في SHOWDOWN', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    // seat3 يملك أقوى يد — سيرفض العرض ويفوز
    startWithBets(room, deckOf('J J J J', 'K K K K', 'Q Q Q Q', 'A A A A'), [1000, 500, 2000, 1500]);

    engine.makeOffer(room, 2, 500);
    engine.respond(room, 3, 'no_cards');
    engine.makeOffer(room, 2, 500);
    engine.respond(room, 0, 'no_cards');
    engine.makeOffer(room, 2, 500);
    engine.respond(room, 1, 'no_cards');

    expect(room.phase).toBe('showdown');
    expect(room.result!.winnerIds).toEqual([room.seats[3]!.id]); // رباعي آكه
    // لا تحويلات — الجميع رفض
    expect(room.seats[2]!.balance).toBe(5000 - 2000);
  });

  it('الكبير يفوز بالجائزة تلقائيًا إذا قبل جميع المفاوَضين', () => {
    const room = startStandard(); // seat2 أضعف يد (QQQQ أقوى من JJ و KK لكن AAA لـ seat0)
    engine.makeOffer(room, 2, 500);
    engine.respond(room, 3, 'accept');
    engine.makeOffer(room, 2, 500);
    engine.respond(room, 0, 'accept');
    engine.makeOffer(room, 2, 500);
    engine.respond(room, 1, 'accept');

    expect(room.phase).toBe('showdown');
    // الكبير هو المتنافس الوحيد المتبقي — يفوز رغم أن ورقه ليس الأقوى
    expect(room.result!.winnerIds).toEqual([room.seats[2]!.id]);
    expect(room.negotiation!.remainingBudget).toBe(500); // 2000 - 1500
  });
});
describe('ميزانية المفاوضة', () => {
  it('الكبير يستطيع تقسيم سومته على عدة لاعبين', () => {
    const room = startStandard(); // ميزانية 2000
    engine.makeOffer(room, 2, 500);
    engine.respond(room, 3, 'accept');
    engine.makeOffer(room, 2, 1000);
    engine.respond(room, 0, 'accept');
    expect(room.negotiation!.remainingBudget).toBe(500);
    // آخر عرض ممكن: 500 بالضبط
    expect(engine.makeOffer(room, 2, 1000).error).toBe('EXCEEDS_BUDGET');
    expect(engine.makeOffer(room, 2, 500).ok).toBe(true);
    engine.respond(room, 1, 'accept');
    expect(room.negotiation!.remainingBudget).toBe(0);
    expect(room.phase).toBe('showdown');
  });

  it('عند استهلاك كامل الميزانية: من تبقى يصبح «لا ورق» تلقائيًا ويظهر في السجل', () => {
    const room = startStandard(); // الكبير seat2=2000، الترتيب [3,0,1]
    engine.makeOffer(room, 2, 2000); // كل سومته لأول لاعب
    engine.respond(room, 3, 'accept');

    expect(room.phase).toBe('showdown'); // انتهت فورًا
    const neg = room.negotiation!;
    expect(neg.remainingBudget).toBe(0);
    expect(neg.log).toHaveLength(3);
    expect(neg.log[1]).toMatchObject({
      playerId: room.seats[0]!.id,
      offer: 0,
      response: 'no_cards',
      auto: true,
    });
    expect(neg.log[2]).toMatchObject({
      playerId: room.seats[1]!.id,
      offer: 0,
      response: 'no_cards',
      auto: true,
    });
    // seat3 خرج باتفاق — المنافسون: 0 و 1 و 2
    expect(room.result!.winnerIds).toEqual([room.seats[0]!.id]); // AAAA
  });
});

describe('الاختيار المسبق (Pre-selection)', () => {
  it('يُحفظ الاختيار ويُطبَّق تلقائيًا عند وصول الدور ويظهر في السجل', () => {
    const room = startStandard(); // الترتيب [3, 0, 1]
    const neg = room.negotiation!;

    // seat0 يختار «قبول» مسبقًا قبل وصول دوره
    expect(engine.preselect(room, 0, 'accept').ok).toBe(true);
    expect(neg.pendingResponses[room.seats[0]!.id]).toBe('accept');
    expect(neg.log).toHaveLength(0); // لم يُنفَّذ بعد

    // الكبير يفاوض seat3 أولًا — لا يتأثر بالاختيار المسبق لغيره
    engine.makeOffer(room, 2, 500);
    engine.respond(room, 3, 'no_cards');
    expect(neg.responses[room.seats[0]!.id]).toBeUndefined();

    // وصل دور seat0 — عرض الكبير يُطبِّق اختياره فورًا
    expect(engine.makeOffer(room, 2, 1000).ok).toBe(true);
    expect(neg.responses[room.seats[0]!.id]).toBe('accept');
    expect(neg.remainingBudget).toBe(1000);
    expect(neg.log[1]).toMatchObject({
      playerId: room.seats[0]!.id,
      offer: 1000,
      response: 'accept',
      auto: true,
    });
    // انتقل تلقائيًا إلى seat1
    expect(neg.order[neg.currentIndex]).toBe(room.seats[1]!.id);
  });

  it('يمكن تعديل أو إلغاء الاختيار المسبق قبل تطبيقه', () => {
    const room = startStandard();
    const neg = room.negotiation!;
    engine.preselect(room, 1, 'no_cards');
    expect(neg.pendingResponses[room.seats[1]!.id]).toBe('no_cards');
    engine.preselect(room, 1, 'accept'); // تعديل
    expect(neg.pendingResponses[room.seats[1]!.id]).toBe('accept');
    engine.preselect(room, 1, null); // إلغاء
    expect(neg.pendingResponses[room.seats[1]!.id]).toBeUndefined();
  });

  it('الكبير والمنسحب ومن أنهى رده لا يستطيعون الاختيار المسبق', () => {
    const room = startStandard();
    expect(engine.preselect(room, 2, 'accept').ok).toBe(false); // الكبير
    engine.makeOffer(room, 2, 500);
    engine.respond(room, 3, 'no_cards');
    expect(engine.preselect(room, 3, 'accept').ok).toBe(false); // أنهى رده
  });

  it('الاختيار المسبق خاص بصاحبه — لا يراه الكبير ولا الآخرون', () => {
    const room = startStandard();
    engine.preselect(room, 0, 'accept');

    const viewBig = toClientState(room, room.seats[2]!.id);
    expect(viewBig.negotiation!.myPendingResponse).toBeNull();
    const viewOther = toClientState(room, room.seats[3]!.id);
    expect(viewOther.negotiation!.myPendingResponse).toBeNull();
    const viewMe = toClientState(room, room.seats[0]!.id);
    expect(viewMe.negotiation!.myPendingResponse).toBe('accept');
    // السجل يراه الجميع
    expect(viewBig.negotiation!.log).toEqual(viewMe.negotiation!.log);
  });
});

describe('الإجراء التلقائي للاعب غير المتصل', () => {
  it('الهدف غير المتصل: «لا ورق» تلقائيًا دون دفع أموال', () => {
    const room = startStandard();
    const neg = room.negotiation!;
    room.seats[3]!.connected = false;

    engine.makeOffer(room, 2, 1000);
    expect(engine.autoNegotiationAct(room).ok).toBe(true);
    expect(neg.responses[room.seats[3]!.id]).toBe('no_cards');
    expect(neg.remainingBudget).toBe(2000); // لم يُخصم شيء
    expect(neg.log[0].auto).toBe(true);
  });

  it('الكبير غير المتصل: عرض تلقائي بالحد الأدنى 500', () => {
    const room = startStandard();
    const neg = room.negotiation!;
    room.seats[2]!.connected = false;

    expect(engine.autoNegotiationAct(room).ok).toBe(true);
    expect(neg.currentOffer).toBe(500); // عرض مفتوح لـ seat3 بانتظار رده
    // الهدف متصل — يرد بنفسه
    expect(engine.respond(room, 3, 'accept').ok).toBe(true);
    expect(neg.remainingBudget).toBe(1500);
  });
});
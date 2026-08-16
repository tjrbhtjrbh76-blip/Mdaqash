import { describe, expect, it } from 'vitest';
import * as engine from '../src/game/engine';
import { currentTurnSeatIndex } from '../src/game/engine';
import { rightOfDealer, turnOrderOf } from '../src/game/dealer';
import { deckOf, finishNegotiationNoCards, makeRoom, setNextDealer } from './helpers';

/**
 * اختبارات محرك اللعبة — سير جولة كامل على السيرفر.
 * الموزع في beginRound يدوَّر، لذا نستخدم setNextDealer لجعله حتميًا:
 * setNextDealer(room, 3) → الموزع الفعلي 0، ويمين الموزع = المقعد 1.
 */

function startRound(room: ReturnType<typeof makeRoom>, deck: ReturnType<typeof deckOf>) {
  engine.beginRound(room, deck);
  engine.startBetting(room);
}

describe('ترتيب الأدوار الدائري وقاعدة يمين الموزع', () => {
  it('rightOfDealer = nextPlayer(dealerIndex)', () => {
    expect(rightOfDealer(0)).toBe(1);
    expect(rightOfDealer(3)).toBe(0);
  });

  it('ترتيب الأدوار يبدأ من يمين الموزع وينتهي بالموزع', () => {
    expect(turnOrderOf(0)).toEqual([1, 2, 3, 0]);
    expect(turnOrderOf(2)).toEqual([3, 0, 1, 2]);
  });

  it('يمين الموزع لا يستطيع الانسحاب ولا الدخول بـ 0', () => {
    const room = makeRoom();
    setNextDealer(room, 3); // الموزع 0 → المجبر 1
    startRound(room, deckOf('J J J J', 'A A A A', 'Q Q Q Q', 'K K K K'));
    expect(room.dealerIndex).toBe(0);
    expect(currentTurnSeatIndex(room)).toBe(1);

    expect(engine.fold(room, 1).error).toBe('FORCED_MUST_ENTER');
    expect(engine.enter(room, 1, 0).error).toBe('MIN_BET');
    expect(engine.enter(room, 1, 500).ok).toBe(true);
  });

  it('بقية اللاعبين يستطيعون عدم الدخول (الانسحاب اختياري)', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    startRound(room, deckOf('J J J J', 'A A A A', 'Q Q Q Q', 'K K K K'));
    engine.enter(room, 1, 500); // المجبر
    expect(engine.fold(room, 2).ok).toBe(true);
    expect(engine.fold(room, 3).ok).toBe(true);
    expect(engine.fold(room, 0).ok).toBe(true); // الموزع نفسه اختياري
  });

  it('لا يمكن اللعب خارج الدور', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    startRound(room, deckOf('J J J J', 'A A A A', 'Q Q Q Q', 'K K K K'));
    expect(engine.enter(room, 3, 500).error).toBe('NOT_YOUR_TURN');
    expect(engine.fold(room, 0).error).toBe('NOT_YOUR_TURN');
  });

  it('لا يمكن تجاوز الرصيد', () => {
    const room = makeRoom([5000, 1000, 5000, 5000]);
    setNextDealer(room, 3);
    startRound(room, deckOf('J J J J', 'A A A A', 'Q Q Q Q', 'K K K K'));
    expect(engine.enter(room, 1, 1500).error).toBe('INSUFFICIENT_BALANCE');
    expect(engine.enter(room, 1, 1000).ok).toBe(true);
  });

describe('حسم الجولة وتوزيع الجائزة', () => {
  it('الفائز يأخذ الجائزة كاملة وتُحدَّث الأرصدة', () => {
    const room = makeRoom();
    setNextDealer(room, 3); // الموزع 0، المجبر 1
    startRound(room, deckOf('J J J J', 'A A A A', 'Q Q Q Q', 'K K K K'));
    engine.enter(room, 1, 500);
    engine.enter(room, 2, 1000);
    engine.enter(room, 3, 500);
    engine.enter(room, 0, 500); // الموزع آخر الأدوار
    finishNegotiationNoCards(room); // الجميع «لا ورق» — نفس تدفق الحسم السابق

    expect(room.phase).toBe('showdown');
    expect(room.result!.winnerIds).toEqual([room.seats[1]!.id]); // رباعي آكه
    expect(room.seats[1]!.balance).toBe(5000 - 500 + 2500);
    expect(room.result!.deltas[room.seats[1]!.id]).toBe(2000);
    expect(room.result!.deltas[room.seats[2]!.id]).toBe(-1000);
    // حفظ المجموع الكلي للأرصدة
    const total = room.seats.reduce((sum, s) => sum + (s?.balance ?? 0), 0);
    expect(total).toBe(20_000);
  });

  it('التعادل التام يقسم الجائزة بالتساوي', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    startRound(room, deckOf('A A K Q', 'A A K Q', 'K K Q J', 'Q Q J J'));
    engine.enter(room, 1, 500);
    engine.enter(room, 2, 500);
    engine.fold(room, 3);
    engine.enter(room, 0, 500);
    finishNegotiationNoCards(room);

    expect(room.result!.winnerIds).toHaveLength(2);
    expect(room.result!.winShare).toBe(750);
    expect(room.seats[0]!.balance).toBe(5250);
    expect(room.seats[1]!.balance).toBe(5250);
    expect(room.seats[2]!.balance).toBe(4500);
    expect(room.seats[3]!.balance).toBe(5000); // انسحب بلا خسارة
  });

  it('داخل واحد فقط يسترد مبلغه كاملًا', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    startRound(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'));
    engine.enter(room, 1, 1000);
    engine.fold(room, 2);
    engine.fold(room, 3);
    engine.fold(room, 0);

    expect(room.seats[1]!.balance).toBe(5000);
    expect(room.result!.deltas[room.seats[1]!.id]).toBe(0);
  });

  it('الوصول لهدف الفوز ينهي اللعبة', () => {
    const room = makeRoom([5000, 5500, 5000, 5000], { startingBalance: 5000, winGoal: 1_000_000 });
    room.settings.winGoal = 6500; // محاكاة قرب الفوز
    setNextDealer(room, 3);
    startRound(room, deckOf('J J J J', 'A A A A', 'Q Q Q Q', 'K K K K'));
    engine.enter(room, 1, 500);
    engine.enter(room, 2, 500);
    engine.enter(room, 3, 500);
    engine.enter(room, 0, 500);
    finishNegotiationNoCards(room);

    expect(room.phase).toBe('gameover');
    expect(room.finalWinnerId).toBe(room.seats[1]!.id);
    expect(room.result!.goalReached).toBe(true);
  });
});

describe('حالات حدّية', () => {
  it('اللاعب المفلس (أقل من 500) يُتخطى تلقائيًا: المُجبَر All-in وغيره انسحاب', () => {
    const room = makeRoom([5000, 300, 5000, 300]);
    setNextDealer(room, 3); // المجبر = مقعد 1 (رصيده 300)
    startRound(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'));

    // المقعد 1 (مجبر، مفلس): دخل تلقائيًا بكل رصيده
    expect(room.seats[1]!.currentBet).toBe(300);
    expect(room.seats[1]!.hasActed).toBe(true);
    // المقعد 2 سليم — الدور عنده الآن
    expect(currentTurnSeatIndex(room)).toBe(2);

    engine.enter(room, 2, 500);
    // المقعد 3 (غير مجبر، مفلس): انسحب تلقائيًا
    expect(room.seats[3]!.folded).toBe(true);
    expect(currentTurnSeatIndex(room)).toBe(0);
  });

  it('autoAct: المجبر غير المتصل يدخل بالحد الأدنى', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    startRound(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'));
    expect(engine.autoAct(room, 1).ok).toBe(true);
    expect(room.seats[1]!.currentBet).toBe(500);
    // غير المجبر غير المتصل ينسحب
    expect(engine.autoAct(room, 2).ok).toBe(true);
    expect(room.seats[2]!.folded).toBe(true);
  });

  it('resetForNewGame يعيد الأرصدة ويصفّر الجولات', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    startRound(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'));
    engine.enter(room, 1, 500);
    engine.fold(room, 2);
    engine.fold(room, 3);
    engine.fold(room, 0);

    engine.resetForNewGame(room);
    expect(room.roundNumber).toBe(0);
    expect(room.result).toBeNull();
    for (const s of room.seats) expect(s!.balance).toBe(5000);
  });
});


  it('تدوير الموزع بعد كل جولة', () => {
    const room = makeRoom();
    setNextDealer(room, 0);
    engine.beginRound(room);
    expect(room.dealerIndex).toBe(1);
    engine.beginRound(room);
    expect(room.dealerIndex).toBe(2);
  });
});

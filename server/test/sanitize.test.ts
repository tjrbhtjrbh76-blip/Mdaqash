import { describe, expect, it } from 'vitest';
import * as engine from '../src/game/engine';
import { toClientState } from '../src/game/sanitize';
import { deckOf, finishNegotiationNoCards, makeRoom, setNextDealer } from './helpers';

describe('خصوصية الأوراق (لا يمكن كشف أوراق الآخرين)', () => {
  it('كل لاعب يرى أوراقه فقط أثناء اللعب', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    engine.beginRound(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'));
    engine.startBetting(room);

    const myId = room.seats[1]!.id;
    const view = toClientState(room, myId);

    // أوراقي تصلني كاملة
    expect(view.players[1]!.cards).toHaveLength(4);
    expect(view.players[1]!.cards![0].rank).toBe('K');
    // أوراق الآخرين مخفية تمامًا — يصل عددها فقط
    for (const i of [0, 2, 3]) {
      expect(view.players[i]!.cards).toBeNull();
      expect(view.players[i]!.cardCount).toBe(4);
    }
    expect(view.youId).toBe(myId);
  });

  it('عند النتيجة تُكشف أوراق الداخلين فقط عبر result.hands', () => {
    const room = makeRoom();
    setNextDealer(room, 3);
    engine.beginRound(room, deckOf('A A A A', 'K K K K', 'Q Q Q Q', 'J J J J'));
    engine.startBetting(room);
    engine.enter(room, 1, 500);
    engine.fold(room, 2);
    engine.fold(room, 3);
    engine.enter(room, 0, 500);
    finishNegotiationNoCards(room); // إنهاء المفاوضة للوصول إلى النتيجة

    const view = toClientState(room, room.seats[2]!.id);
    expect(view.result).not.toBeNull();
    const hands = view.result!.hands;
    const handOf = (idx: number) => hands.find((h) => h.playerId === room.seats[idx]!.id)!;

    // الداخلون: أوراقهم مكشوفة
    expect(handOf(0).entered).toBe(true);
    expect(handOf(0).cards).toHaveLength(4);
    expect(handOf(1).entered).toBe(true);
    expect(handOf(1).cards).toHaveLength(4);
    // المنسحبون: لا تُكشف أوراقهم
    expect(handOf(2).entered).toBe(false);
    expect(handOf(2).cards).toHaveLength(0);
    expect(handOf(3).entered).toBe(false);
    expect(handOf(3).cards).toHaveLength(0);
    // وحتى بعد النتيجة: حقل cards في المقاعد يبقى مخفيًا عن الآخرين
    expect(view.players[0]!.cards).toBeNull();
  });
});

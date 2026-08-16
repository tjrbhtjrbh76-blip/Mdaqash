import { randomInt } from 'crypto';
import type { Server, Socket } from 'socket.io';
import {
  COUNTDOWN_MS,
  DEALING_MS,
  DISCONNECTED_TURN_TIMEOUT_MS,
  EMPTY_ROOM_TTL_MS,
  LOBBY_SEAT_GRACE_MS,
  WIN_GOAL_STEP,
} from '../shared/constants';
import { Ack, NegotiationResponse, RoomSettings } from '../shared/types';
import * as engine from '../game/engine';
import { toClientState } from '../game/sanitize';
import { createRoom, createSeat, isFull, Room, seatIndexOf } from '../game/state';

/**
 * مدير الغرف — يربط محرك اللعبة بالسوكتات.
 * مسؤول عن: إنشاء/انضمام/استعادة الغرف، المؤقتات، الانقطاع، والبث المُنقّح.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  /** socketId → { roomCode, playerId } */
  private socketIndex = new Map<string, { roomCode: string; playerId: string }>();

  constructor(private io: Server) {}

  /* ---------------- إنشاء وانضمام واستعادة ---------------- */

  createGame(socket: Socket, name: string): Ack<{ roomCode: string; playerId: string }> {
    const clean = sanitizeName(name);
    if (!clean) return { ok: false, error: 'NAME_REQUIRED', message: 'NAME_REQUIRED' };

    const code = this.generateCode();
    const room = createRoom(code, clean, defaultSettings());
    room.seats[0]!.socketId = socket.id;

    this.rooms.set(code, room);
    this.socketIndex.set(socket.id, { roomCode: code, playerId: room.seats[0]!.id });
    this.broadcast(room);
    return { ok: true, data: { roomCode: code, playerId: room.seats[0]!.id } };
  }

  joinGame(socket: Socket, name: string, code: string): Ack<{ roomCode: string; playerId: string }> {
    const clean = sanitizeName(name);
    if (!clean) return { ok: false, error: 'NAME_REQUIRED', message: 'NAME_REQUIRED' };

    const room = this.rooms.get(normalizeCode(code));
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM_NOT_FOUND' };
    if (room.phase !== 'waiting') {
      return { ok: false, error: 'GAME_IN_PROGRESS', message: 'GAME_IN_PROGRESS' };
    }

    const freeIdx = room.seats.findIndex((s) => s === null);
    if (freeIdx === -1) return { ok: false, error: 'ROOM_FULL', message: 'ROOM_FULL' };

    const seat = createSeat(clean, room.settings.startingBalance);
    seat.socketId = socket.id;
    room.seats[freeIdx] = seat;
    this.socketIndex.set(socket.id, { roomCode: room.code, playerId: seat.id });

    if (isFull(room)) {
      this.startCountdown(room);
    } else {
      this.broadcast(room);
    }
    return { ok: true, data: { roomCode: room.code, playerId: seat.id } };
  }

  /** استعادة الجلسة بعد انقطاع — نفس المقعد ونفس الأوراق والرصيد */
  rejoin(socket: Socket, code: string, playerId: string): Ack<{ roomCode: string; playerId: string }> {
    const room = this.rooms.get(normalizeCode(code));
    if (!room) return { ok: false, error: 'SESSION_EXPIRED', message: 'SESSION_EXPIRED' };

    const idx = seatIndexOf(room, playerId);
    if (idx === -1) return { ok: false, error: 'SESSION_EXPIRED', message: 'SESSION_EXPIRED' };

    const seat = room.seats[idx]!;
    if (seat.socketId && seat.socketId !== socket.id) {
      this.socketIndex.delete(seat.socketId);
    }
    seat.socketId = socket.id;
    seat.connected = true;
    this.socketIndex.set(socket.id, { roomCode: room.code, playerId });

    this.broadcast(room);
    return { ok: true, data: { roomCode: room.code, playerId } };
  }

  leave(socket: Socket): void {
    const ref = this.socketIndex.get(socket.id);
    if (!ref) return;
    const room = this.rooms.get(ref.roomCode);
    this.socketIndex.delete(socket.id);
    if (!room) return;

    const idx = seatIndexOf(room, ref.playerId);
    if (idx === -1) return;

    if (room.phase === 'waiting' || room.phase === 'countdown') {
      // في الانتظار: إخلاء المقعد فورًا وإيقاف العد التنازلي
      this.clearPhaseTimers(room);
      room.seats[idx] = null;
      room.countdownEndsAt = null;
      room.phase = 'waiting';
      if (room.ownerId === ref.playerId) {
        const next = room.seats.find((s) => s !== null);
        room.ownerId = next ? next.id : '';
      }
      if (room.seats.every((s) => s === null)) {
        this.rooms.delete(room.code);
        return;
      }
      this.broadcast(room);
    } else {
      // أثناء اللعب: المقعد يبقى محجوزًا ويُعامل كلاعب غير متصل
      const seat = room.seats[idx]!;
      seat.connected = false;
      seat.socketId = null;
      this.broadcast(room);
      this.armTurnTimerIfNeeded(room);
    }
  }

  /* ---------------- الإعدادات (صاحب الغرفة فقط، قبل بدء اللعبة) ---------------- */

  updateSettings(socket: Socket, settings: Partial<RoomSettings>): Ack {
    const ctx = this.contextOf(socket);
    if (!ctx) return { ok: false, error: 'NOT_IN_ROOM', message: 'NOT_IN_ROOM' };
    const { room } = ctx;

    if (room.ownerId !== ctx.playerId) return { ok: false, error: 'NOT_OWNER', message: 'NOT_OWNER' };
    if (room.phase !== 'waiting') return { ok: false, error: 'BAD_PHASE', message: 'BAD_PHASE' };

    const next: RoomSettings = { ...room.settings };
    if (settings.startingBalance !== undefined) {
      const v = settings.startingBalance;
      if (!Number.isInteger(v) || v <= 0 || v % 500 !== 0) {
        return { ok: false, error: 'INVALID_SETTINGS', message: 'INVALID_SETTINGS' };
      }
      next.startingBalance = v;
    }
    if (settings.winGoal !== undefined) {
      const v = settings.winGoal;
      // هدف الفوز يجب أن يكون من مضاعفات المليون
      if (!Number.isInteger(v) || v <= 0 || v % WIN_GOAL_STEP !== 0) {
        return { ok: false, error: 'INVALID_SETTINGS', message: 'INVALID_SETTINGS' };
      }
      next.winGoal = v;
    }

    room.settings = next;
    // تحديث أرصدة الجالسين (ما زلنا في الانتظار)
    for (const s of room.seats) {
      if (s) s.balance = next.startingBalance;
    }
    this.broadcast(room);
    return { ok: true };
  }

  /* ---------------- أوامر اللعب ---------------- */

  playerEnter(socket: Socket, amount: number): Ack {
    const ctx = this.contextOf(socket);
    if (!ctx) return { ok: false, error: 'NOT_IN_ROOM', message: 'NOT_IN_ROOM' };
    const result = engine.enter(ctx.room, ctx.seatIndex, amount);
    if (!result.ok) return { ok: false, error: result.error!, message: result.error! };
    this.afterAction(ctx.room);
    return { ok: true };
  }

  playerFold(socket: Socket): Ack {
    const ctx = this.contextOf(socket);
    if (!ctx) return { ok: false, error: 'NOT_IN_ROOM', message: 'NOT_IN_ROOM' };
    const result = engine.fold(ctx.room, ctx.seatIndex);
    if (!result.ok) return { ok: false, error: result.error!, message: result.error! };
    this.afterAction(ctx.room);
    return { ok: true };
  }
  /* ---------------- أوامر المفاوضة ---------------- */

  /** الكبير يقدم عرضًا للاعب الجاري التفاوض معه */
  playerOffer(socket: Socket, amount: number): Ack {
    const ctx = this.contextOf(socket);
    if (!ctx) return { ok: false, error: 'NOT_IN_ROOM', message: 'NOT_IN_ROOM' };
    const result = engine.makeOffer(ctx.room, ctx.seatIndex, amount);
    if (!result.ok) return { ok: false, error: result.error!, message: result.error! };
    this.afterAction(ctx.room);
    return { ok: true };
  }

  /** اللاعب المفاوَض يرد على العرض المفتوح: قبول أو «لا ورق» */
  playerRespond(socket: Socket, response: NegotiationResponse): Ack {
    const ctx = this.contextOf(socket);
    if (!ctx) return { ok: false, error: 'NOT_IN_ROOM', message: 'NOT_IN_ROOM' };
    const result = engine.respond(ctx.room, ctx.seatIndex, response);
    if (!result.ok) return { ok: false, error: result.error!, message: result.error! };
    this.afterAction(ctx.room);
    return { ok: true };
  }

  /** اختيار مسبق للرد — يُطبَّق تلقائيًا عند وصول الدور (null يلغيه) */
  playerPreselect(socket: Socket, response: NegotiationResponse | null): Ack {
    const ctx = this.contextOf(socket);
    if (!ctx) return { ok: false, error: 'NOT_IN_ROOM', message: 'NOT_IN_ROOM' };
    const result = engine.preselect(ctx.room, ctx.seatIndex, response);
    if (!result.ok) return { ok: false, error: result.error!, message: result.error! };
    this.afterAction(ctx.room);
    return { ok: true };
  }

  nextRound(socket: Socket): Ack {
    const ctx = this.contextOf(socket);
    if (!ctx) return { ok: false, error: 'NOT_IN_ROOM', message: 'NOT_IN_ROOM' };
    if (ctx.room.phase !== 'showdown') {
      return { ok: false, error: 'BAD_PHASE', message: 'BAD_PHASE' };
    }
    this.beginDealing(ctx.room);
    return { ok: true };
  }

  playAgain(socket: Socket): Ack {
    const ctx = this.contextOf(socket);
    if (!ctx) return { ok: false, error: 'NOT_IN_ROOM', message: 'NOT_IN_ROOM' };
    if (ctx.room.phase !== 'gameover') {
      return { ok: false, error: 'BAD_PHASE', message: 'BAD_PHASE' };
    }
    engine.resetForNewGame(ctx.room);
    this.startCountdown(ctx.room);
    return { ok: true };
  }

  /* ---------------- الانقطاع واستعادة الاتصال ---------------- */

  handleDisconnect(socket: Socket): void {
    const ref = this.socketIndex.get(socket.id);
    if (!ref) return;
    this.socketIndex.delete(socket.id);
    const room = this.rooms.get(ref.roomCode);
    if (!room) return;

    const idx = seatIndexOf(room, ref.playerId);
    if (idx === -1) return;
    const seat = room.seats[idx]!;
    seat.connected = false;
    seat.socketId = null;

    if (room.phase === 'waiting' || room.phase === 'countdown') {
      // مهلة سماح قبل إخلاء المقعد (تحديث الصفحة مثلًا)
      this.setPhaseTimer(room, () => {
        const stillOff = room.seats[idx];
        if (
          stillOff &&
          !stillOff.connected &&
          (room.phase === 'waiting' || room.phase === 'countdown')
        ) {
          room.seats[idx] = null;
          this.clearPhaseTimers(room);
          room.phase = 'waiting';
          room.countdownEndsAt = null;
          if (room.ownerId === ref.playerId) {
            const next = room.seats.find((s) => s !== null);
            room.ownerId = next ? next.id : '';
          }
          if (room.seats.every((s) => s === null)) {
            this.rooms.delete(room.code);
            return;
          }
          this.broadcast(room);
        }
      }, LOBBY_SEAT_GRACE_MS);
      this.broadcast(room);
    } else {
      this.broadcast(room);
      this.armTurnTimerIfNeeded(room);
    }

    this.maybeScheduleCleanup(room);
  }

  /* ---------------- المؤقتات وسير الجولات ---------------- */

  private startCountdown(room: Room): void {
    this.clearPhaseTimers(room);
    room.phase = 'countdown';
    room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    this.broadcast(room);
    this.setPhaseTimer(room, () => this.beginDealing(room), COUNTDOWN_MS);
  }

  private beginDealing(room: Room): void {
    this.clearPhaseTimers(room);
    engine.beginRound(room);
    this.broadcast(room);
    this.setPhaseTimer(room, () => {
      engine.startBetting(room);
      this.broadcast(room);
      this.armTurnTimerIfNeeded(room);
    }, DEALING_MS);
  }

  private afterAction(room: Room): void {
    if (room.phase !== 'betting' && room.phase !== 'negotiation') {
      this.clearTurnTimer(room);
    }
    this.broadcast(room);
    if (room.phase === 'betting' || room.phase === 'negotiation') {
      this.armTurnTimerIfNeeded(room);
    }
  }

  /** إذا كان صاحب الدور الحالي غير متصل، اضبط مؤقتًا للإجراء التلقائي */
  private armTurnTimerIfNeeded(room: Room): void {
    this.clearTurnTimer(room);
    if (room.phase === 'negotiation') {
      // أثناء المفاوضة: المنتظَر هو الكبير (لتقديم عرض) أو الهدف (للرد)
      const nIdx = engine.negotiationActorSeatIndex(room);
      if (nIdx === null) return;
      const nSeat = room.seats[nIdx];
      if (!nSeat || nSeat.connected) return;

      room.turnTimer = setTimeout(() => {
        room.turnTimer = null;
        if (room.phase !== 'negotiation') return;
        const current = engine.negotiationActorSeatIndex(room);
        if (current === null) return;
        const s = room.seats[current];
        if (s && !s.connected) {
          engine.autoNegotiationAct(room);
          this.afterAction(room);
        }
      }, DISCONNECTED_TURN_TIMEOUT_MS);
      return;
    }
    if (room.phase !== 'betting') return;
    const idx = engine.currentTurnSeatIndex(room);
    if (idx === null) return;
    const seat = room.seats[idx];
    if (!seat || seat.connected) return;

    room.turnTimer = setTimeout(() => {
      room.turnTimer = null;
      if (room.phase !== 'betting') return;
      const current = engine.currentTurnSeatIndex(room);
      if (current === null) return;
      const s = room.seats[current];
      if (s && !s.connected) {
        engine.autoAct(room, current);
        this.afterAction(room);
      }
    }, DISCONNECTED_TURN_TIMEOUT_MS);
  }

  private clearTurnTimer(room: Room): void {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
  }

  private setPhaseTimer(room: Room, fn: () => void, ms: number): NodeJS.Timeout {
    const t = setTimeout(() => {
      room.timers.delete(t);
      fn();
    }, ms);
    room.timers.add(t);
    return t;
  }

  private clearPhaseTimers(room: Room): void {
    for (const t of room.timers) clearTimeout(t);
    room.timers.clear();
  }

  /** حذف الغرفة إذا انقطع الجميع عنها */
  private maybeScheduleCleanup(room: Room): void {
    const anyConnected = room.seats.some((s) => s !== null && s.connected);
    if (!anyConnected) {
      this.setPhaseTimer(room, () => {
        const stillEmpty = room.seats.every((s) => s === null || !s.connected);
        if (stillEmpty) {
          this.clearPhaseTimers(room);
          this.clearTurnTimer(room);
          this.rooms.delete(room.code);
        }
      }, EMPTY_ROOM_TTL_MS);
    }
  }

  /* ---------------- أدوات ---------------- */

  /** بث الحالة المُنقّحة لكل لاعب على حدة (كل لاعب يرى أوراقه فقط) */
  broadcast(room: Room): void {
    for (const seat of room.seats) {
      if (!seat || !seat.connected || !seat.socketId) continue;
      this.io.to(seat.socketId).emit('room:state', toClientState(room, seat.id));
    }
  }

  private contextOf(socket: Socket): { room: Room; playerId: string; seatIndex: number } | null {
    const ref = this.socketIndex.get(socket.id);
    if (!ref) return null;
    const room = this.rooms.get(ref.roomCode);
    if (!room) return null;
    const seatIndex = seatIndexOf(room, ref.playerId);
    if (seatIndex === -1) return null;
    return { room, playerId: ref.playerId, seatIndex };
  }

  private generateCode(): string {
    let code = '';
    do {
      code = `MDQ-${randomInt(1000, 10000)}`;
    } while (this.rooms.has(code));
    return code;
  }

  /** عدد الغرف النشطة (للمراقبة والاختبار) */
  get roomCount(): number {
    return this.rooms.size;
  }
}

/* ---------------- أدوات مساعدة ---------------- */

export function sanitizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 16);
  return clean.length >= 1 ? clean : null;
}

export function normalizeCode(code: unknown): string {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

export function defaultSettings(): RoomSettings {
  return { startingBalance: 5_000, winGoal: 1_000_000 };
}

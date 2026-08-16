import type { Server, Socket } from 'socket.io';
import { Ack, NegotiationResponse, RoomSettings } from './shared/types';
import { RoomManager } from './rooms/RoomManager';

/**
 * طبقة السوكت — تستقبل «نوايا» اللاعبين فقط وتمررها للسيرفر.
 * لا يقبل السيرفر من العميل: رصيدًا، أو أوراقًا، أو نتائج — كلها تُحسب هنا.
 */

export interface CreatePayload {
  name?: unknown;
}
export interface JoinPayload {
  name?: unknown;
  roomCode?: unknown;
}
export interface RejoinPayload {
  roomCode?: unknown;
  playerId?: unknown;
}
export interface EnterPayload {
  amount?: unknown;
}
export interface OfferPayload {
  amount?: unknown;
}
export interface RespondPayload {
  response?: unknown;
}
export interface PreselectPayload {
  response?: unknown;
}

/** تحويل مدخل الرد إلى قيمة صالحة — null يعني إلغاء الاختيار المسبق */
function parseResponse(v: unknown): NegotiationResponse | null | undefined {
  if (v === 'accept' || v === 'no_cards') return v;
  if (v === null || v === undefined) return null;
  return undefined; // قيمة غير صالحة
}
export interface SettingsPayload {
  startingBalance?: unknown;
  winGoal?: unknown;
}

export function registerSocket(socket: Socket, manager: RoomManager, _io: Server): void {
  socket.on('room:create', (payload: CreatePayload, cb?: (res: Ack<{ roomCode: string; playerId: string }>) => void) => {
    const res = manager.createGame(socket, String(payload?.name ?? ''));
    cb?.(res);
  });

  socket.on('room:join', (payload: JoinPayload, cb?: (res: Ack<{ roomCode: string; playerId: string }>) => void) => {
    const res = manager.joinGame(socket, String(payload?.name ?? ''), String(payload?.roomCode ?? ''));
    cb?.(res);
  });

  socket.on('room:rejoin', (payload: RejoinPayload, cb?: (res: Ack<{ roomCode: string; playerId: string }>) => void) => {
    const res = manager.rejoin(socket, String(payload?.roomCode ?? ''), String(payload?.playerId ?? ''));
    cb?.(res);
  });

  socket.on('room:leave', () => {
    manager.leave(socket);
  });

  socket.on('room:updateSettings', (payload: SettingsPayload, cb?: (res: Ack) => void) => {
    const settings: Partial<RoomSettings> = {};
    if (payload?.startingBalance !== undefined) settings.startingBalance = Number(payload.startingBalance);
    if (payload?.winGoal !== undefined) settings.winGoal = Number(payload.winGoal);
    const res = manager.updateSettings(socket, settings);
    cb?.(res);
  });

  socket.on('game:enter', (payload: EnterPayload, cb?: (res: Ack) => void) => {
    const amount = Number(payload?.amount);
    const res = manager.playerEnter(socket, amount);
    cb?.(res);
  });

  // الأحداث التالية قد تصل مع أو بدون حمولة — نلتقط دالة الرد من آخر وسيط دائمًا
  const withAck =
    (handler: () => Ack) =>
    (...args: unknown[]) => {
      const cb = args.find((a) => typeof a === 'function') as ((res: Ack) => void) | undefined;
      cb?.(handler());
    };

  socket.on('game:offer', (payload: OfferPayload, cb?: (res: Ack) => void) => {
    const res = manager.playerOffer(socket, Number(payload?.amount));
    cb?.(res);
  });

  socket.on('game:respond', (payload: RespondPayload, cb?: (res: Ack) => void) => {
    const r = parseResponse(payload?.response);
    if (r === undefined || r === null) {
      cb?.({ ok: false, error: 'INVALID_RESPONSE', message: 'INVALID_RESPONSE' });
      return;
    }
    cb?.(manager.playerRespond(socket, r));
  });

  socket.on('game:preselect', (payload: PreselectPayload, cb?: (res: Ack) => void) => {
    const r = parseResponse(payload?.response);
    if (r === undefined) {
      cb?.({ ok: false, error: 'INVALID_RESPONSE', message: 'INVALID_RESPONSE' });
      return;
    }
    cb?.(manager.playerPreselect(socket, r));
  });

  socket.on('game:fold', withAck(() => manager.playerFold(socket)));
  socket.on('game:nextRound', withAck(() => manager.nextRound(socket)));
  socket.on('game:playAgain', withAck(() => manager.playAgain(socket)));

  socket.on('disconnect', () => {
    manager.handleDisconnect(socket);
  });
}

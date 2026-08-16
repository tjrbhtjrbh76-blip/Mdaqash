import { io, Socket } from 'socket.io-client';
import type { Ack } from '../../server/src/shared/types';

/**
 * اتصال السوكت — نفس الأصل في الإنتاج، وعبر بروكسي Vite في التطوير.
 * العميل يرسل «نوايا» فقط، وكل قواعد اللعبة تنفَّذ على السيرفر.
 */
export const socket: Socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
});

/** إرسال حدث وانتظار رد السيرفر (Ack) */
export function emitAck<T = undefined>(event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload ?? {}, (err: unknown, res: Ack<T>) => {
      if (err || !res) {
        resolve({ ok: false, error: 'NETWORK', message: 'NETWORK' });
      } else {
        resolve(res);
      }
    });
  });
}

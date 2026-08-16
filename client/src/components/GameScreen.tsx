import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store';
import { fmt } from '../format';
import { PLAYER_COUNT } from '../../../server/src/shared/constants';
import type { ClientPlayerView, RevealedHand } from '../../../server/src/shared/types';
import PlayerSeat from './PlayerSeat';
import CardView from './CardView';
import BettingPanel from './BettingPanel';
import NegotiationPanel from './NegotiationPanel';
import NegotiationLog from './NegotiationLog';
import ShowdownModal from './ShowdownModal';
import GameOverModal from './GameOverModal';

/** مواقع المقاعد حول الطاولة نسبةً لموقع اللاعب الحالي (دائمًا في الأسفل) */
const POSITIONS: Record<number, string> = {
  0: 'absolute -bottom-1 right-1/2 translate-x-1/2', // أنا
  1: 'absolute right-[0.5%] top-1/2 -translate-y-1/2', // على يميني
  2: 'absolute -top-1 right-1/2 translate-x-1/2', // المقابل
  3: 'absolute left-[0.5%] top-1/2 -translate-y-1/2', // على يساري
};

function relativePosition(seatIndex: number, myIndex: number): number {
  return (seatIndex - myIndex + PLAYER_COUNT) % PLAYER_COUNT;
}

export default function GameScreen() {
  const { room, enter, fold, nextRound, playAgain, leaveRoom } = useStore();
  if (!room) return null;

  const me = room.players.find((p): p is ClientPlayerView => p !== null && p.id === room.youId) ?? null;
  const myIndex = me?.seatIndex ?? 0;
  const forcedSeatIndex = (room.dealerIndex + 1) % PLAYER_COUNT;
  const turnPlayer = room.turnIndex !== null ? room.players[room.turnIndex] : null;
  const isMyTurn = room.phase === 'betting' && me !== null && room.turnIndex === myIndex;

  const revealedById = new Map<string, RevealedHand>();
  if (room.result) {
    for (const h of room.result.hands) revealedById.set(h.playerId, h);
  }
  const showCards = room.phase !== 'countdown';
  const showDelta = room.phase === 'showdown' || room.phase === 'gameover';

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* الشريط العلوي */}
      <header className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900/80 border-b border-slate-800 z-10">
        <div className="font-black text-amber-400 text-xl">مداقش</div>
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-bold">
          <span className="bg-slate-800 rounded-lg px-2 py-1 text-emerald-400" dir="ltr">
            {room.code}
          </span>
          <span className="bg-slate-800 rounded-lg px-2 py-1">الجولة {room.roundNumber}</span>
          <span className="bg-slate-800 rounded-lg px-2 py-1 text-amber-300">
            🏆 {fmt(room.settings.winGoal)}
          </span>
        </div>
        <button
          onClick={leaveRoom}
          className="text-slate-400 hover:text-red-400 text-sm font-bold transition-colors"
        >
          خروج ✕
        </button>
      </header>

      {/* الطاولة */}
      <main className="flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0">
        <div className="felt-table relative w-full max-w-3xl h-full max-h-[58vh] rounded-[50%]">
          {/* الجائزة في المنتصف */}
          <div className="absolute right-1/2 top-1/2 translate-x-1/2 -translate-y-1/2 text-center z-10">
            <motion.div
              key={`pot-${room.pot}`}
              initial={{ scale: 0.7 }}
              animate={{ scale: 1 }}
              className="bg-slate-950/70 border border-amber-500/40 rounded-2xl px-4 py-2"
            >
              <div className="text-[10px] text-slate-400 font-bold">الجائزة</div>
              <div className="text-amber-400 font-black text-xl sm:text-2xl" dir="ltr">
                🪙 {fmt(room.pot)}
              </div>
            </motion.div>
          </div>

          {/* المقاعد */}
          {room.players.map((p) => {
            if (!p) return null;
            const rel = relativePosition(p.seatIndex, myIndex);
            return (
              <div key={p.id} className={`${POSITIONS[rel]} z-10`}>
                <PlayerSeat
                  player={p}
                  isDealer={p.seatIndex === room.dealerIndex}
                  isBig={room.negotiation?.bigPlayerId === p.id}
                  isTurn={room.turnIndex === p.seatIndex && room.phase === 'betting'}
                  isMe={p.id === room.youId}
                  isForced={p.seatIndex === forcedSeatIndex && room.phase === 'betting'}
                  revealed={revealedById.get(p.id) ?? null}
                  roundKey={room.roundNumber}
                  showDelta={showDelta}
                />
              </div>
            );
          })}

          {/* أوراقي (مكشوفة لي فقط — تصل من السيرفر لي وحدي) */}
          {showCards && me && me.cards && me.cards.length > 0 && (
            <div
              className="absolute bottom-[16%] right-1/2 translate-x-1/2 flex gap-1 sm:gap-2 z-20"
              dir="ltr"
              key={`my-cards-${room.roundNumber}`}
            >
              {me.cards.map((c, i) => (
                <CardView key={c.id} card={c} size="lg" delay={0.3 + i * 0.15} dealIn />
              ))}
            </div>
          )}

          {/* سجل المفاوضات اللحظي — يراه الجميع أثناء المفاوضة */}
          {room.phase === 'negotiation' && room.negotiation && <NegotiationLog room={room} />}

          {/* طبقة العد التنازلي */}
          {room.phase === 'countdown' && room.countdownEndsAt && (
            <CountdownOverlay endsAt={room.countdownEndsAt} />
          )}

          {/* ومضة توزيع الأوراق */}
          {room.phase === 'dealing' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
            >
              <div className="bg-slate-950/80 border border-amber-500/40 rounded-2xl px-6 py-3 text-xl font-black text-amber-300">
                🎴 توزيع الأوراق…
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* الشريط السفلي: لوحة المراهنة أو حالة الانتظار */}
      <footer className="p-3 z-10">
        <AnimatePresence mode="wait">
          {room.phase === 'negotiation' && room.negotiation ? (
            <NegotiationPanel key={`neg-${room.roundNumber}`} room={room} />
          ) : room.phase === 'betting' && isMyTurn && me ? (
            <BettingPanel
              key={`panel-${room.roundNumber}`}
              me={me}
              isForced={myIndex === forcedSeatIndex}
              onEnter={(amount) => void enter(amount)}
              onFold={() => void fold()}
            />
          ) : room.phase === 'betting' ? (
            <motion.div
              key="status"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-lg mx-auto bg-slate-900/90 border border-slate-700 rounded-2xl px-4 py-3 text-center font-bold text-slate-300"
            >
              {me?.hasActed ? (
                me.folded ? (
                  <span>انسحبت من هذه الجولة — بانتظار النتيجة…</span>
                ) : (
                  <span>
                    دخلت بـ <span className="text-amber-300 font-black">{fmt(me.currentBet)}</span> —
                    بانتظار بقية اللاعبين…
                  </span>
                )
              ) : turnPlayer ? (
                <span>
                  بانتظار دور <span className="text-amber-300 font-black">{turnPlayer.name}</span>
                  {turnPlayer.connected ? '…' : ' (غير متصل 🔴)'}
                </span>
              ) : (
                <span>…</span>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </footer>

      {/* نوافذ النتائج */}
      {room.phase === 'showdown' && room.result && (
        <ShowdownModal room={room} onNextRound={() => void nextRound()} />
      )}
      {room.phase === 'gameover' && (
        <GameOverModal room={room} onPlayAgain={() => void playAgain()} />
      )}
    </div>
  );
}

/** عدّاد تنازلي مركزي قبل بدء الجولة */
function CountdownOverlay({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/70 rounded-[50%]">
      <div className="text-slate-200 font-bold mb-2">اكتمل اللاعبون — تبدأ الجولة خلال</div>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={remaining}
          initial={{ scale: 2.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="text-8xl font-black text-amber-400"
        >
          {remaining}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}


import { AnimatePresence, motion } from 'framer-motion';
import type { ClientPlayerView, RevealedHand } from '../../../server/src/shared/types';
import { fmt, fmtSigned } from '../format';
import CardView from './CardView';

interface Props {
  player: ClientPlayerView;
  isDealer: boolean;
  /** الكبير في مرحلة المفاوضة (صاحب أعلى سومة) */
  isBig?: boolean;
  isTurn: boolean;
  isMe: boolean;
  /** اللاعب المُجبَر على الدخول (يمين الموزع) */
  isForced: boolean;
  /** اليد المكشوفة عند النتيجة (إن وُجدت) */
  revealed?: RevealedHand | null;
  /** مفتاح الجولة لإعادة تشغيل أنيميشن التوزيع */
  roundKey: number;
  showDelta: boolean;
}

export default function PlayerSeat({
  player,
  isDealer,
  isBig = false,
  isTurn,
  isMe,
  isForced,
  revealed,
  roundKey,
  showDelta,
}: Props) {
  const showRevealedCards = revealed && revealed.entered && revealed.cards.length > 0;

  return (
    <div className="flex flex-col items-center gap-1 w-28 sm:w-36 text-center">
      {/* بطاقة الاسم والرصيد */}
      <div
        className={`relative w-full rounded-2xl border px-2 py-2 bg-slate-900/85 backdrop-blur transition-colors ${
          isTurn ? 'border-amber-400 turn-ring' : 'border-slate-700'
        }`}
      >
        {/* شارة الموزع */}
        {isDealer && (
          <div className="absolute -top-3 -right-2 bg-amber-500 text-slate-950 text-[10px] font-black rounded-full px-2 py-0.5 shadow">
            🎴 الموزع
          </div>
        )}
        {isBig && (
          <div className="absolute -top-3 -left-2 bg-emerald-600 text-white text-[10px] font-black rounded-full px-2 py-0.5 shadow">
            👑 الكبير
          </div>
        )}
        {isForced && !isDealer && (
          <div className="absolute -top-3 -right-2 bg-rose-600 text-white text-[10px] font-black rounded-full px-2 py-0.5 shadow">
            عليه الدخول
          </div>
        )}

        {/* صافي الربح/الخسارة بعد الجولة */}
        <AnimatePresence>
          {showDelta && player.lastDelta !== null && player.lastDelta !== 0 && (
            <motion.div
              key={`delta-${roundKey}`}
              initial={{ opacity: 0, y: 8, scale: 0.7 }}
              animate={{ opacity: 1, y: -14, scale: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute -top-2 left-1/2 -translate-x-1/2 font-black text-sm px-2 rounded-full ${
                player.lastDelta > 0 ? 'bg-emerald-600 text-white' : 'bg-red-700 text-white'
              }`}
            >
              {fmtSigned(player.lastDelta)}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-center gap-1 font-black text-sm sm:text-base truncate">
          <span className={player.connected ? 'text-emerald-400' : 'text-red-400'}>
            {player.connected ? '🟢' : '🔴'}
          </span>
          <span className="truncate">
            {player.name}
            {isMe && <span className="text-emerald-400 text-xs"> (أنت)</span>}
          </span>
        </div>

        <div className="text-amber-300 font-bold text-xs sm:text-sm" dir="ltr">
          🪙 {fmt(player.balance)}
        </div>

        {/* حالة اللاعب */}
        <div className="text-[11px] font-bold h-4">
          {!player.connected ? (
            <span className="text-red-400">غير متصل</span>
          ) : isTurn ? (
            <span className="text-amber-400">● يلعب الآن</span>
          ) : player.folded ? (
            <span className="text-slate-500">منسحب</span>
          ) : player.currentBet > 0 ? (
            <span className="text-emerald-400">داخل ✓</span>
          ) : null}
        </div>
      </div>

      {/* شريحة الرهان */}
      <AnimatePresence>
        {player.currentBet > 0 && (
          <motion.div
            key={`bet-${roundKey}-${player.currentBet}`}
            initial={{ scale: 0, y: -8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0 }}
            className="bg-amber-500 text-slate-950 text-xs font-black rounded-full px-3 py-1 shadow-lg border-2 border-amber-200"
          >
            🪙 {fmt(player.currentBet)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* الأوراق المصغرة: ظهور مقلوبة، أو مكشوفة عند النتيجة */}
      <div className="flex gap-0.5 justify-center mt-1" key={`cards-${roundKey}`} dir="ltr">
        {showRevealedCards
          ? revealed.cards.map((c, i) => (
              <CardView key={c.id} card={c} size="xs" delay={i * 0.08} />
            ))
          : Array.from({ length: player.cardCount }).map((_, i) => (
              <CardView key={`back-${i}`} faceDown size="xs" delay={i * 0.12} dealIn={roundKey > 0} />
            ))}
      </div>

      {/* وصف اليد المكشوفة */}
      {showRevealedCards && (
        <div className="text-[10px] font-black text-amber-300">{revealed.handLabel}</div>
      )}
    </div>
  );
}

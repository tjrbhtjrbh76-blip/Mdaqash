import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { ClientRoomState } from '../../../server/src/shared/types';
import { fmt, fmtSigned } from '../format';
import CardView from './CardView';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

interface Props {
  room: ClientRoomState;
  onNextRound: () => void;
}

/** نافذة نتيجة الجولة: الفائز، يده، الربح، والترتيب */
export default function ShowdownModal({ room, onNextRound }: Props) {
  const result = room.result!;
  const isMeWinner = result.winnerIds.includes(room.youId);
  const winnerNames = result.winnerIds
    .map((id) => result.standings.find((s) => s.playerId === id)?.name ?? '')
    .filter(Boolean);
  const winnerHand = result.hands.find((h) => h.playerId === result.winnerIds[0]);

  useEffect(() => {
    if (isMeWinner) {
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.7 },
        colors: ['#fbbf24', '#10b981', '#ffffff'],
      });
    }
  }, [isMeWinner, result.roundNumber]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.85, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-2xl font-black text-center text-amber-400 mb-4">🏆 نتيجة الجولة</h2>

        {/* الفائز */}
        <div className="text-center mb-4">
          <div className="text-slate-400 text-sm font-bold mb-1">الفائز</div>
          <div className="text-3xl font-black text-emerald-400">{winnerNames.join(' و ')}</div>
          {isMeWinner && <div className="text-amber-300 font-bold mt-1">🎉 أنت الفائز!</div>}
        </div>

        {/* يد الفائز */}
        {winnerHand && winnerHand.cards.length > 0 && (
          <div className="mb-4">
            <div className="flex justify-center gap-1 mb-2" dir="ltr">
              {winnerHand.cards.map((c, i) => (
                <CardView key={c.id} card={c} size="sm" delay={i * 0.1} />
              ))}
            </div>
            <div className="text-center text-amber-300 font-black">{winnerHand.handLabel}</div>
          </div>
        )}

        {/* الربح */}
        <div className="text-center mb-5">
          <div className="text-slate-400 text-sm font-bold mb-1">الجائزة</div>
          <div className="text-2xl font-black text-emerald-400" dir="ltr">
            🪙 {fmt(result.pot)}
          </div>
        </div>

        {/* أوراق جميع الداخلين — عرض مختصر مع نوع اليد */}
        <div className="bg-slate-800/70 rounded-2xl p-3 mb-4">
          <div className="text-slate-400 text-xs font-bold mb-2">أوراق اللاعبين</div>
          <div className="space-y-2">
            {result.hands
              .filter((h) => h.entered)
              .map((h) => (
                <div key={h.playerId} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-xs truncate">
                      {h.playerName}
                      {h.playerId === room.youId && (
                        <span className="text-emerald-400 text-[10px]"> (أنت)</span>
                      )}
                    </div>
                    <div className="text-amber-300 text-[10px] font-black truncate">
                      {h.handLabel}
                    </div>
                  </div>
                  <div className="flex gap-0.5 shrink-0" dir="ltr">
                    {h.cards.map((c) => (
                      <CardView key={c.id} card={c} size="xs" />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* ملخص المفاوضات */}
        {room.negotiation && room.negotiation.log.length > 0 && (
          <div className="bg-slate-800/70 rounded-2xl p-3 mb-4">
            <div className="text-slate-400 text-xs font-bold mb-2">🤝 المفاوضات</div>
            <div className="space-y-1 text-[11px] font-bold">
              {room.negotiation.log.map((e, i) => (
                <div key={`${e.playerId}-${i}`} className="flex items-center gap-2 text-slate-300">
                  <span className="flex-1 truncate">
                    {room.negotiation!.bigPlayerName} → {e.playerName}
                    {e.playerId === room.youId && (
                      <span className="text-emerald-400"> (أنت)</span>
                    )}
                  </span>
                  <span className="text-slate-400" dir="ltr">
                    {e.offer > 0 ? fmt(e.offer) : 'بدون عرض'}
                  </span>
                  <span className={e.response === 'accept' ? 'text-emerald-400' : 'text-red-400'}>
                    {e.response === 'accept' ? 'قبلت' : 'لا ورق'}
                    {e.auto && ' (تلقائي)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* الترتيب */}
        <div className="bg-slate-800/70 rounded-2xl p-3 mb-5">
          <div className="text-slate-400 text-xs font-bold mb-2">الترتيب</div>
          <div className="space-y-1.5">
            {result.standings.map((s, i) => {
              const delta = result.deltas[s.playerId] ?? 0;
              return (
                <div
                  key={s.playerId}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                    s.playerId === room.youId ? 'bg-emerald-950/60 border border-emerald-700/50' : 'bg-slate-900/50'
                  }`}
                >
                  <span>{MEDALS[i]}</span>
                  <span className="font-black flex-1 truncate">
                    {s.name}
                    {s.playerId === room.youId && <span className="text-emerald-400 text-xs"> (أنت)</span>}
                  </span>
                  {delta !== 0 && (
                    <span
                      className={`text-xs font-black ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      dir="ltr"
                    >
                      {fmtSigned(delta)}
                    </span>
                  )}
                  <span className="text-amber-300 font-bold text-sm" dir="ltr">
                    {fmt(s.balance)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onNextRound}
          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-lg rounded-xl py-3 transition-colors"
        >
          🎴 الجولة التالية
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

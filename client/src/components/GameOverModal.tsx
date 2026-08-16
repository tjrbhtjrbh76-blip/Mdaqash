import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { ClientRoomState } from '../../../server/src/shared/types';
import { fmt } from '../format';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

interface Props {
  room: ClientRoomState;
  onPlayAgain: () => void;
}

/** شاشة نهاية اللعبة — عند وصول لاعب إلى هدف الفوز */
export default function GameOverModal({ room, onPlayAgain }: Props) {
  const result = room.result;
  const winner = room.players.find((p) => p?.id === room.finalWinnerId) ?? null;
  const isMeWinner = room.finalWinnerId === room.youId;

  useEffect(() => {
    // مؤثر احتفالي متكرر
    const fire = (x: number) =>
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { x, y: 0.6 },
        colors: ['#fbbf24', '#10b981', '#f472b6', '#ffffff'],
      });
    fire(0.3);
    fire(0.7);
    const interval = setInterval(() => fire(Math.random()), 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.7, y: 60 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
        className="w-full max-w-md bg-slate-900 border-2 border-amber-400 rounded-3xl p-8 shadow-2xl text-center max-h-[90vh] overflow-y-auto"
      >
        <motion.div
          animate={{ rotate: [0, -8, 8, -8, 0], scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-7xl mb-3"
        >
          🏆
        </motion.div>

        <h1 className="text-3xl font-black text-amber-400 mb-1">انتهت اللعبة</h1>
        <div className="text-slate-400 font-bold mb-4">🎉 وصل إلى هدف الفوز</div>

        <div className="bg-slate-800/80 rounded-2xl p-4 mb-5">
          <div className="text-slate-400 text-sm font-bold">الفائز</div>
          <div className="text-4xl font-black text-emerald-400 mb-1">
            {winner?.name ?? '—'}
            {isMeWinner && <span className="text-lg text-amber-300"> (أنت! 🎉)</span>}
          </div>
          <div className="text-slate-400 text-sm font-bold">
            الرصيد:{' '}
            <span className="text-amber-300 font-black" dir="ltr">
              {winner ? fmt(winner.balance) : '—'}
            </span>
          </div>
        </div>

        {result && (
          <div className="bg-slate-800/70 rounded-2xl p-3 mb-6 text-right">
            <div className="text-slate-400 text-xs font-bold mb-2">الترتيب النهائي</div>
            <div className="space-y-1.5">
              {result.standings.map((s, i) => (
                <div
                  key={s.playerId}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                    s.playerId === room.finalWinnerId
                      ? 'bg-amber-500/15 border border-amber-500/40'
                      : 'bg-slate-900/50'
                  }`}
                >
                  <span>{MEDALS[i]}</span>
                  <span className="font-black flex-1 truncate">{s.name}</span>
                  <span className="text-amber-300 font-bold text-sm" dir="ltr">
                    {fmt(s.balance)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onPlayAgain}
          className="w-full bg-emerald-600 hover:bg-emerald-500 font-black text-lg rounded-xl py-3 transition-colors"
        >
          🎮 لعبة جديدة
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

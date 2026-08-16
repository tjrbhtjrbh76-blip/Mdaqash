import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ClientPlayerView } from '../../../server/src/shared/types';
import { BET_STEP, MIN_BET } from '../../../server/src/shared/constants';
import { fmt } from '../format';

interface Props {
  me: ClientPlayerView;
  isForced: boolean;
  onEnter: (amount: number) => void;
  onFold: () => void;
}

/** لوحة الدخول/المراهنة للاعب الحالي — مضاعفات 500 فقط */
export default function BettingPanel({ me, isForced, onEnter, onFold }: Props) {
  const minEntry = Math.min(MIN_BET, Math.max(me.balance, 0));
  const [amount, setAmount] = useState(minEntry);

  const canDecrease = amount - BET_STEP >= minEntry;
  const canIncrease = amount + BET_STEP <= me.balance;
  const canEnter = amount >= minEntry && amount <= me.balance;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-lg mx-auto bg-slate-900/95 backdrop-blur border border-amber-500/40 rounded-3xl p-4 sm:p-5 shadow-2xl"
    >
      {isForced && (
        <div className="text-center text-rose-400 text-xs sm:text-sm font-black mb-3">
          ⚠️ أنت يمين الموزع — يجب الدخول بـ {fmt(MIN_BET)} على الأقل
        </div>
      )}

      <div className="flex items-center justify-around mb-4">
        <div className="text-center">
          <div className="text-slate-400 text-xs font-bold mb-1">رصيدك</div>
          <div className="text-amber-300 font-black text-xl" dir="ltr">
            {fmt(me.balance)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-slate-400 text-xs font-bold mb-1">مبلغ الدخول</div>
          <div className="text-white font-black text-3xl" dir="ltr">
            {fmt(amount)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mb-4">
        <motion.button
          whileTap={{ scale: 0.92 }}
          disabled={!canDecrease}
          onClick={() => setAmount((a) => a - BET_STEP)}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed font-black rounded-xl px-5 py-2 text-lg transition-colors"
        >
          −{fmt(BET_STEP)}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.92 }}
          disabled={!canIncrease}
          onClick={() => setAmount((a) => a + BET_STEP)}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed font-black rounded-xl px-5 py-2 text-lg transition-colors"
        >
          +{fmt(BET_STEP)}
        </motion.button>
      </div>

      <div className="flex gap-2">
        <motion.button
          whileTap={{ scale: 0.96 }}
          disabled={!canEnter}
          onClick={() => onEnter(amount)}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-black text-lg rounded-xl py-3 transition-colors"
        >
          دخول {fmt(amount)} 🪙
        </motion.button>
        {!isForced && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onFold}
            className="bg-red-800/80 hover:bg-red-700 font-black rounded-xl px-6 py-3 transition-colors"
          >
            انسحاب
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

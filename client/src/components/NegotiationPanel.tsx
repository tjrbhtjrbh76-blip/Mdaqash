import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ClientRoomState, NegotiationResponse } from '../../../server/src/shared/types';
import { BET_STEP, MIN_BET } from '../../../server/src/shared/constants';
import { fmt } from '../format';
import { useStore } from '../store';

interface Props {
  room: ClientRoomState;
}

/**
 * لوحة مرحلة المفاوضة — تظهر في الشريط السفلي:
 * - الكبير: يحدد قيمة العرض للاعب الجاري التفاوض معه (مضاعفات 500، بحدود الميزانية المتبقية)
 * - الهدف: يرى العرض ويختار [قبول] أو [لا ورق]
 * - من لم يصل دوره: يستطيع حفظ اختيار مسبق يُطبَّق تلقائيًا عند وصول دوره
 */
export default function NegotiationPanel({ room }: Props) {
  const { offer, respondOffer, preselect } = useStore();
  const neg = room.negotiation!;
  const youId = room.youId;

  const isBig = neg.bigPlayerId === youId;
  const isTarget = neg.currentTargetId === youId;
  const awaitingOffer = neg.currentOffer === null;
  const inOrder = neg.order.includes(youId);
  const alreadyResponded = neg.log.some((e) => e.playerId === youId);
  const myPending = neg.myPendingResponse;

  const targetName = neg.currentTargetId
    ? (room.players.find((p) => p?.id === neg.currentTargetId)?.name ?? '')
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-lg mx-auto bg-slate-900/95 backdrop-blur border border-emerald-500/40 rounded-3xl p-4 sm:p-5 shadow-2xl"
    >
      {/* الترويسة: الكبير والميزانية */}
      <div className="flex items-center justify-between gap-2 mb-3 text-xs sm:text-sm font-bold">
        <span className="text-emerald-400">🤝 مرحلة المفاوضة</span>
        <span className="text-slate-300">
          الكبير: <span className="text-amber-300 font-black">👑 {neg.bigPlayerName}</span>
        </span>
        <span className="text-slate-400">
          المتبقي:{' '}
          <span className="text-amber-300 font-black" dir="ltr">
            {fmt(neg.remainingBudget)}
          </span>
        </span>
      </div>

      {/* الكبير: تقديم عرض */}
      {isBig && awaitingOffer && neg.currentTargetId && (
        <OfferForm
          key={`offer-${neg.currentIndex}`}
          targetName={targetName}
          remainingBudget={neg.remainingBudget}
          onSubmit={(amount) => void offer(amount)}
        />
      )}

      {/* الكبير: بانتظار رد الهدف */}
      {isBig && !awaitingOffer && (
        <div className="text-center font-bold text-slate-300 py-2">
          عرضك{' '}
          <span className="text-amber-300 font-black" dir="ltr">
            {fmt(neg.currentOffer!)}
          </span>{' '}
          لـ <span className="text-amber-300 font-black">{targetName}</span> — بانتظار رده…
        </div>
      )}

      {/* الهدف: الرد على عرض مفتوح */}
      {isTarget && !awaitingOffer && (
        <div>
          <div className="text-center mb-3">
            <div className="text-slate-400 text-xs font-bold mb-1">
              {neg.bigPlayerName} يعرض عليك مقابل الخروج من الجولة
            </div>
            <div className="text-3xl font-black text-amber-300" dir="ltr">
              {fmt(neg.currentOffer!)}
            </div>
          </div>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => void respondOffer('accept')}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-black text-lg rounded-xl py-3 transition-colors"
            >
              قبول {fmt(neg.currentOffer!)} 🤝
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => void respondOffer('no_cards')}
              className="flex-1 bg-red-800/80 hover:bg-red-700 font-black text-lg rounded-xl py-3 transition-colors"
            >
              لا ورق ✊
            </motion.button>
          </div>
        </div>
      )}

      {/* الهدف بانتظار عرض الكبير، أو لاعب لاحق: اختيار مسبق */}
      {inOrder && !alreadyResponded && !isBig && (awaitingOffer || !isTarget) && (
        <PreselectForm
          isCurrentTarget={isTarget}
          myPending={myPending}
          onSelect={(r) => void preselect(r)}
        />
      )}

      {/* من أنهى رده */}
      {inOrder && alreadyResponded && (
        <div className="text-center font-bold text-slate-300 py-2">
          تم تسجيل ردك — بانتظار بقية المفاوضات…
        </div>
      )}

      {/* منسحب من الجولة أصلًا */}
      {!inOrder && !isBig && (
        <div className="text-center font-bold text-slate-300 py-2">
          أنت خارج المفاوضة — بانتظار انتهائها…
        </div>
      )}
    </motion.div>
  );
}

/** نموذج الكبير لتحديد قيمة العرض — مضاعفات 500 بين 500 والميزانية المتبقية */
function OfferForm({
  targetName,
  remainingBudget,
  onSubmit,
}: {
  targetName: string;
  remainingBudget: number;
  onSubmit: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(Math.min(MIN_BET, remainingBudget));

  const canDecrease = amount - BET_STEP >= MIN_BET;
  const canIncrease = amount + BET_STEP <= remainingBudget;
  const canSubmit = amount >= MIN_BET && amount <= remainingBudget;

  return (
    <div>
      <div className="text-center text-slate-300 font-bold text-sm mb-3">
        قدّم عرضًا لـ <span className="text-amber-300 font-black">{targetName}</span> — «خذ واطلع»
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
        <div className="text-white font-black text-3xl" dir="ltr">
          {fmt(amount)}
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          disabled={!canIncrease}
          onClick={() => setAmount((a) => a + BET_STEP)}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed font-black rounded-xl px-5 py-2 text-lg transition-colors"
        >
          +{fmt(BET_STEP)}
        </motion.button>
      </div>

      <motion.button
        whileTap={{ scale: 0.96 }}
        disabled={!canSubmit}
        onClick={() => onSubmit(amount)}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-black text-lg rounded-xl py-3 transition-colors"
      >
        قدّم العرض {fmt(amount)} 💰
      </motion.button>
    </div>
  );
}
/** الاختيار المسبق للاعبين الذين لم يصل دورهم — يُطبَّق تلقائيًا عند وصول الدور */
function PreselectForm({
  isCurrentTarget,
  myPending,
  onSelect,
}: {
  isCurrentTarget: boolean;
  myPending: NegotiationResponse | null;
  onSelect: (r: NegotiationResponse | null) => void;
}) {
  const options: { value: NegotiationResponse; label: string; activeClass: string }[] = [
    { value: 'accept', label: 'سأقبل 🤝', activeClass: 'bg-emerald-600 border-emerald-300' },
    { value: 'no_cards', label: 'لا ورق ✊', activeClass: 'bg-red-800 border-red-400' },
  ];

  return (
    <div className="border-t border-slate-700/60 pt-3 mt-1">
      <div className="text-center text-slate-400 text-xs font-bold mb-2">
        {isCurrentTarget
          ? 'الكبير يجهّز عرضه لك — يمكنك حفظ ردك مسبقًا:'
          : 'دورك قادم — حدّد موقفك مسبقًا ليُطبَّق تلقائيًا:'}
      </div>
      <div className="flex gap-2">
        {options.map((opt) => {
          const selected = myPending === opt.value;
          return (
            <motion.button
              key={opt.value}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelect(selected ? null : opt.value)}
              className={`flex-1 font-black rounded-xl py-2.5 border transition-colors ${
                selected
                  ? `${opt.activeClass} text-white`
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {opt.label}
              {selected && <span className="block text-[10px] font-bold opacity-80">✓ محفوظ — اضغط للإلغاء</span>}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
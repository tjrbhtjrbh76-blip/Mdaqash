import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ClientRoomState } from '../../../server/src/shared/types';
import { fmt } from '../format';

interface Props {
  room: ClientRoomState;
}

/**
 * سجل المفاوضات اللحظي — يراه جميع اللاعبين أثناء المفاوضة.
 * يُعرض من منظور صاحب الجهاز: اسمه يظهر «أنت»، والأحداث تُسرد بزاويته هو.
 */
export default function NegotiationLog({ room }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const neg = room.negotiation;
  if (!neg) return null;

  const nameOf = (id: string) =>
    id === room.youId ? 'أنت' : (room.players.find((p) => p?.id === id)?.name ?? '—');

  const targetName = neg.currentTargetId ? nameOf(neg.currentTargetId) : null;

  return (
    <div className="absolute top-2 left-2 z-20 w-52 sm:w-64 max-w-[45%]">
      <div className="bg-slate-950/85 backdrop-blur border border-emerald-500/30 rounded-2xl overflow-hidden shadow-xl">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-black text-emerald-400 hover:bg-slate-800/50 transition-colors"
        >
          <span>🤝 سجل المفاوضات</span>
          <span className="text-slate-400">{collapsed ? '▾' : '▴'}</span>
        </button>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-2 space-y-1.5 max-h-40 overflow-y-auto text-[11px] font-bold">
                {neg.log.length === 0 && neg.currentTargetId === null && (
                  <div className="text-slate-500">…</div>
                )}

                {neg.log.map((entry, i) => (
                  <motion.div
                    key={`${entry.playerId}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="border-r-2 border-emerald-600/50 pr-2"
                  >
                    <div className="text-slate-300">
                      <span className="text-amber-300">👑 {nameOf(neg.bigPlayerId)}</span>
                      {' → '}
                      <span className={entry.playerId === room.youId ? 'text-emerald-400' : ''}>
                        {nameOf(entry.playerId)}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      {entry.offer > 0 ? (
                        <>
                          «خذ <span dir="ltr">{fmt(entry.offer)}</span> واطلع»
                        </>
                      ) : (
                        <span className="text-slate-500">لا يوجد رصيد متبقٍ للعرض</span>
                      )}
                    </div>
                    <div
                      className={
                        entry.response === 'accept' ? 'text-emerald-400' : 'text-red-400'
                      }
                    >
                      {entry.response === 'accept' ? 'قبلت ✋' : 'لا ورق ✊'}
                      {entry.auto && <span className="text-slate-500"> (تلقائي)</span>}
                    </div>
                  </motion.div>
                ))}

                {/* المفاوضة الجارية */}
                {targetName && (
                  <div className="border-r-2 border-amber-500/60 pr-2 text-slate-300">
                    <span className="text-amber-300">👑 {nameOf(neg.bigPlayerId)}</span>
                    {' → '}
                    <span className={neg.currentTargetId === room.youId ? 'text-emerald-400' : ''}>
                      {targetName}
                    </span>
                    <div className="text-slate-400">
                      {neg.currentOffer !== null ? (
                        <>
                          عرض <span dir="ltr">{fmt(neg.currentOffer)}</span> — بانتظار الرد…
                        </>
                      ) : (
                        'الكبير يجهّز عرضه…'
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

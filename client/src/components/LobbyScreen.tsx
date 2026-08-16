import { motion } from 'framer-motion';
import { useStore } from '../store';
import { fmt } from '../format';
import {
  START_BALANCE_PRESETS,
  WIN_GOAL_PRESETS,
  PLAYER_COUNT,
} from '../../../server/src/shared/constants';

/** شاشة الانتظار: كود الغرفة، اللاعبون، إعدادات صاحب الغرفة */
export default function LobbyScreen() {
  const { room, leaveRoom, updateSettings, showToast } = useStore();
  if (!room) return null;

  const joined = room.players.filter((p) => p !== null);
  const isOwner = room.ownerId === room.youId;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      showToast('✅ تم نسخ كود الغرفة');
    } catch {
      showToast('تعذر النسخ — انسخه يدويًا');
    }
  };

  const shareCode = async () => {
    const text = `تعال العب مداقش! كود الغرفة: ${room.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'مداقش', text });
        return;
      } catch {
        /* أُلغيت المشاركة */
      }
    }
    await copyCode();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-slate-900/80 backdrop-blur border border-emerald-800/50 rounded-3xl p-6 sm:p-8 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-black text-amber-400">مداقش</h1>
          <button
            onClick={leaveRoom}
            className="text-slate-400 hover:text-red-400 text-sm font-bold transition-colors"
          >
            مغادرة الغرفة ✕
          </button>
        </div>

        {/* كود الغرفة */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 mb-6 text-center">
          <div className="text-slate-400 text-sm mb-1">كود الغرفة</div>
          <div dir="ltr" className="text-3xl font-black tracking-[0.3em] text-emerald-400 mb-3">
            {room.code}
          </div>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => void copyCode()}
              className="bg-slate-700 hover:bg-slate-600 rounded-lg px-4 py-2 text-sm font-bold transition-colors"
            >
              📋 نسخ الكود
            </button>
            <button
              onClick={() => void shareCode()}
              className="bg-emerald-700 hover:bg-emerald-600 rounded-lg px-4 py-2 text-sm font-bold transition-colors"
            >
              📤 مشاركة
            </button>
          </div>
        </div>

        {/* الإعدادات */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3">
            <div className="text-slate-400 text-xs mb-2 font-bold">💰 رصيد البداية</div>
            {isOwner ? (
              <select
                value={room.settings.startingBalance}
                onChange={(e) => void updateSettings({ startingBalance: Number(e.target.value) })}
                className="w-full bg-slate-700 rounded-lg px-2 py-2 font-bold outline-none"
              >
                {START_BALANCE_PRESETS.map((v) => (
                  <option key={v} value={v}>
                    {fmt(v)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="font-black text-lg">{fmt(room.settings.startingBalance)}</div>
            )}
          </div>
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3">
            <div className="text-slate-400 text-xs mb-2 font-bold">🏆 هدف الفوز</div>
            {isOwner ? (
              <select
                value={room.settings.winGoal}
                onChange={(e) => void updateSettings({ winGoal: Number(e.target.value) })}
                className="w-full bg-slate-700 rounded-lg px-2 py-2 font-bold outline-none"
              >
                {WIN_GOAL_PRESETS.map((v) => (
                  <option key={v} value={v}>
                    {fmt(v)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="font-black text-lg">{fmt(room.settings.winGoal)}</div>
            )}
          </div>
        </div>
        {/* اللاعبون */}
        <div className="mb-2 flex items-center justify-between">
          <div className="font-bold text-slate-300">بانتظار اكتمال اللاعبين</div>
          <div className="font-black text-amber-400">
            {joined.length} / {PLAYER_COUNT} لاعبين
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: PLAYER_COUNT }).map((_, i) => {
            const p = room.players[i];
            if (!p) {
              return (
                <div
                  key={`empty-${i}`}
                  className="border border-dashed border-slate-700 rounded-xl px-4 py-3 text-slate-500 font-bold"
                >
                  ⚪ بانتظار لاعب
                </div>
              );
            }
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <span className="text-xl">👤</span>
                <span className="font-black flex-1">
                  {p.name}
                  {p.id === room.youId && <span className="text-emerald-400 text-xs mr-2">(أنت)</span>}
                  {p.id === room.ownerId && (
                    <span className="text-amber-400 text-xs mr-2">👑 صاحب الغرفة</span>
                  )}
                </span>
                <span className={`text-sm font-bold ${p.connected ? 'text-emerald-400' : 'text-red-400'}`}>
                  {p.connected ? '🟢 متصل' : '🔴 غير متصل'}
                </span>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}


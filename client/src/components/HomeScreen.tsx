import { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store';

/** شاشة الدخول: الاسم + إنشاء غرفة أو الانضمام بكود */
export default function HomeScreen() {
  const { name, setName, createRoom, joinRoom, busy } = useStore();
  const [code, setCode] = useState('');

  const validName = name.trim().length > 0;
  const validCode = code.trim().length >= 4;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900/80 backdrop-blur border border-emerald-800/50 rounded-3xl p-8 shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🃏</div>
          <h1 className="text-5xl font-black text-amber-400 mb-2">مداقش</h1>
          <p className="text-slate-400">لعبة ورق أونلاين — 4 لاعبين حقيقيين</p>
        </div>

        <label className="block text-sm font-bold text-slate-300 mb-2">أدخل اسمك للانضمام</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اكتب اسمك"
          maxLength={16}
          className="w-full bg-slate-800 border border-slate-700 focus:border-amber-400 outline-none rounded-xl px-4 py-3 text-lg font-bold mb-6 transition-colors"
        />

        <motion.button
          whileTap={{ scale: 0.96 }}
          disabled={!validName || busy}
          onClick={() => void createRoom(name.trim())}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-lg rounded-xl py-3 mb-6 transition-colors"
        >
          🎴 إنشاء غرفة جديدة
        </motion.button>

        <div className="flex items-center gap-3 mb-6 text-slate-500 text-sm">
          <div className="flex-1 h-px bg-slate-700" />
          أو انضم بكود غرفة
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="MDQ-0000"
            maxLength={8}
            dir="ltr"
            className="flex-1 bg-slate-800 border border-slate-700 focus:border-emerald-400 outline-none rounded-xl px-4 py-3 text-lg font-bold text-center tracking-widest transition-colors"
          />
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={!validName || !validCode || busy}
            onClick={() => void joinRoom(name.trim(), code.trim())}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl px-6 transition-colors"
          >
            دخول
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

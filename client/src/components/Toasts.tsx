import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store';

export default function Toasts() {
  const toast = useStore((s) => s.toast);

  return (
    <div className="fixed top-4 inset-x-0 z-[100] flex justify-center pointer-events-none px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            className="bg-red-950/95 border border-red-500/50 text-red-100 px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm sm:text-base"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

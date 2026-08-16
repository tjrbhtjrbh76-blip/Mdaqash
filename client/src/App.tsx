import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store';
import HomeScreen from './components/HomeScreen';
import LobbyScreen from './components/LobbyScreen';
import GameScreen from './components/GameScreen';
import Toasts from './components/Toasts';

export default function App() {
  const room = useStore((s) => s.room);
  const connected = useStore((s) => s.connected);

  return (
    <div className="min-h-screen">
      <AnimatePresence mode="wait">
        {!room ? (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <HomeScreen />
          </motion.div>
        ) : room.phase === 'waiting' ? (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LobbyScreen />
          </motion.div>
        ) : (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GameScreen />
          </motion.div>
        )}
      </AnimatePresence>

      {/* شريط انقطاع الاتصال */}
      <AnimatePresence>
        {!connected && (
          <motion.div
            initial={{ y: 60 }}
            animate={{ y: 0 }}
            exit={{ y: 60 }}
            className="fixed bottom-0 inset-x-0 z-[90] bg-red-900/95 text-center text-sm font-bold py-2 border-t border-red-500/50"
          >
            🔴 انقطع الاتصال بالسيرفر — جارٍ إعادة المحاولة…
          </motion.div>
        )}
      </AnimatePresence>

      <Toasts />
    </div>
  );
}

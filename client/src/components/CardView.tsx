import { motion } from 'framer-motion';
import type { Card, Suit } from '../../../server/src/shared/types';

const SUIT_SYMBOL: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const RED_SUITS: Suit[] = ['hearts', 'diamonds'];

export const RANK_AR: Record<string, string> = {
  A: 'آكه',
  K: 'شايب',
  Q: 'بنت',
  J: 'ولد',
};

type Size = 'xs' | 'sm' | 'lg';

const SIZE_CLASS: Record<Size, string> = {
  xs: 'w-6 h-9 sm:w-7 sm:h-10 text-[10px]',
  sm: 'w-9 h-14 sm:w-11 sm:h-16 text-xs',
  lg: 'w-16 h-24 sm:w-20 sm:h-28 text-base',
};

interface Props {
  card?: Card | null;
  faceDown?: boolean;
  size?: Size;
  /** تأخير ظهور الورقة (أنيميشن التوزيع) */
  delay?: number;
  /** أنيميشن توزيع من منتصف الطاولة عند أول ظهور */
  dealIn?: boolean;
}

export default function CardView({ card, faceDown, size = 'sm', delay = 0, dealIn = false }: Props) {
  const isRed = card ? RED_SUITS.includes(card.suit) : false;
  const sizeClass = SIZE_CLASS[size];

  const initial = dealIn
    ? { opacity: 0, y: size === 'lg' ? -220 : 0, scale: 0.4, rotate: -20 }
    : { opacity: 0, scale: 0.7 };

  if (faceDown || !card) {
    return (
      <motion.div
        initial={initial}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }}
        className={`card-back ${sizeClass} rounded-md sm:rounded-lg shrink-0`}
      />
    );
  }

  return (
    <motion.div
      initial={initial}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }}
      className={`card-face ${sizeClass} rounded-md sm:rounded-lg shrink-0 relative select-none ${
        isRed ? 'text-red-600' : 'text-slate-900'
      }`}
    >
      {/* الزاوية */}
      <div className="absolute top-0.5 right-1 leading-none font-bold">
        <div>{card.rank}</div>
        <div className="text-[0.8em]">{SUIT_SYMBOL[card.suit]}</div>
      </div>
      {/* المنتصف */}
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <div className={size === 'lg' ? 'text-3xl sm:text-4xl font-black' : 'text-lg font-black'}>
          {card.rank}
        </div>
        <div className={size === 'lg' ? 'text-xl sm:text-2xl' : 'text-sm'}>
          {SUIT_SYMBOL[card.suit]}
        </div>
      </div>
    </motion.div>
  );
}

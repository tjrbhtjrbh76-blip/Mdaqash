import { Card, Rank } from '../shared/types';

/**
 * تقييم قوة اليد — يعمل على السيرفر فقط.
 *
 * قوة الورقة:  A > K > Q > J   (آكه > شايب > بنت > ولد)
 *
 * قوة اليد (من الأقوى إلى الأضعف):
 *   1) رباعي  — أربع أوراق من نفس النوع  (AAAA > KKKK > QQQQ > JJJJ)
 *   2) ثلاثي  — ثلاث أوراق متطابقة + ورقة (AAA K > KKK Q)
 *   3) زوجان  — ورقتان متطابقتان + ورقتان متطابقتان (AA KK > KK QQ)
 *   4) ثنائي  — ورقتان متطابقتان + ورقتان مختلفتان (AA KQ > AA QJ و AA KJ > AA QJ)
 *   5) بدون زوج — أربع أوراق مختلفة (A K Q J) — كلها متعادلة دائمًا
 */

export const RANK_VALUE: Record<Rank, number> = { A: 4, K: 3, Q: 2, J: 1 };

export const RANK_NAME_AR: Record<Rank, string> = {
  A: 'آكه',
  K: 'شايب',
  Q: 'بنت',
  J: 'ولد',
};

export type HandCategory = 'four' | 'three' | 'twoPair' | 'pair' | 'high';

const CATEGORY_VALUE: Record<HandCategory, number> = {
  four: 4,
  three: 3,
  twoPair: 2,
  pair: 1,
  high: 0,
};

const CATEGORY_NAME_AR: Record<HandCategory, string> = {
  four: 'رباعي',
  three: 'ثلاثي',
  twoPair: 'زوجان',
  pair: 'ثنائي',
  high: 'بدون زوج',
};

export interface HandEvaluation {
  category: HandCategory;
  /** قيم كسر التعادل بالترتيب (مثل: [قوة الثنائي, الكيكر الأول, الكيكر الثاني]) */
  tiebreak: number[];
  /** وصف عربي لليد مثل: «ثنائي آكه» */
  label: string;
}

interface RankGroup {
  rank: Rank;
  count: number;
  value: number;
}

export function evaluateHand(cards: Card[]): HandEvaluation {
  if (cards.length !== 4) {
    throw new Error(`اليد يجب أن تحتوي على 4 أوراق بالضبط، وصلت: ${cards.length}`);
  }

  const counts = new Map<Rank, number>();
  for (const c of cards) {
    counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  }

  // ترتيب المجموعات: الأكثر تكرارًا أولًا، ثم الأقوى قيمة
  const groups: RankGroup[] = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count, value: RANK_VALUE[rank] }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const pattern = groups.map((g) => g.count).join(',');

  switch (pattern) {
    case '4': {
      return {
        category: 'four',
        tiebreak: [groups[0].value],
        label: `${CATEGORY_NAME_AR.four} ${RANK_NAME_AR[groups[0].rank]}`,
      };
    }
    case '3,1': {
      // عند التعادل: قارن قيمة الثلاثي ثم الورقة المتبقية
      return {
        category: 'three',
        tiebreak: [groups[0].value, groups[1].value],
        label: `${CATEGORY_NAME_AR.three} ${RANK_NAME_AR[groups[0].rank]}`,
      };
    }
    case '2,2': {
      // زوجان: المجموعتان مرتبتان — الأقوى أولًا
      return {
        category: 'twoPair',
        tiebreak: [groups[0].value, groups[1].value],
        label: `${CATEGORY_NAME_AR.twoPair} (${RANK_NAME_AR[groups[0].rank]} و ${RANK_NAME_AR[groups[1].rank]})`,
      };
    }
    case '2,1,1': {
      // عند التعادل: قوة الثنائي، ثم الورقة الأعلى المتبقية، ثم الأخيرة
      return {
        category: 'pair',
        tiebreak: [groups[0].value, groups[1].value, groups[2].value],
        label: `${CATEGORY_NAME_AR.pair} ${RANK_NAME_AR[groups[0].rank]}`,
      };
    }
    default: {
      // أربع أوراق مختلفة (A K Q J) — أضعف يد، وجميعها متعادلة
      return {
        category: 'high',
        tiebreak: groups.map((g) => g.value).sort((a, b) => b - a),
        label: CATEGORY_NAME_AR.high,
      };
    }
  }
}

/** مقارنة تقييمين: موجب = a أقوى، سالب = b أقوى، صفر = تعادل تام */
export function compareEvaluations(a: HandEvaluation, b: HandEvaluation): number {
  const ca = CATEGORY_VALUE[a.category];
  const cb = CATEGORY_VALUE[b.category];
  if (ca !== cb) return ca - cb;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** مقارنة يدين مباشرة */
export function compareHands(a: Card[], b: Card[]): number {
  return compareEvaluations(evaluateHand(a), evaluateHand(b));
}

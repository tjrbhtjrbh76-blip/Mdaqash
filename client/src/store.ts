import { create } from 'zustand';
import { emitAck, socket } from './socket';
import type { ClientRoomState, NegotiationResponse, RoomSettings } from '../../server/src/shared/types';

/** ترجمة أكواد أخطاء السيرفر للعربية */
export const ERROR_AR: Record<string, string> = {
  NETWORK: 'تعذر الاتصال بالسيرفر',
  ROOM_NOT_FOUND: 'الغرفة غير موجودة — تأكد من الكود',
  ROOM_FULL: 'الغرفة ممتلئة (4 لاعبين)',
  GAME_IN_PROGRESS: 'اللعبة جارية — لا يمكن الانضمام الآن',
  NAME_REQUIRED: 'أدخل اسمًا صحيحًا',
  NOT_YOUR_TURN: 'ليس دورك الآن',
  INVALID_AMOUNT: 'المبلغ يجب أن يكون من مضاعفات 500',
  MIN_BET: 'الحد الأدنى للدخول 500',
  INSUFFICIENT_BALANCE: 'لا يمكنك تجاوز رصيدك',
  FORCED_MUST_ENTER: 'أنت يمين الموزع — يجب الدخول بـ 500 على الأقل',
  BAD_PHASE: 'هذا الإجراء غير متاح الآن',
  NOT_OWNER: 'فقط صاحب الغرفة يمكنه تغيير الإعدادات',
  INVALID_SETTINGS: 'إعدادات غير صالحة — هدف الفوز يجب أن يكون من مضاعفات المليون',
  NOT_IN_ROOM: 'أنت لست في غرفة',
  SESSION_EXPIRED: 'الغرفة لم تعد متاحة — انضم من جديد',
  NOT_BIG_PLAYER: 'فقط الكبير يمكنه تقديم العروض',
  EXCEEDS_BUDGET: 'العرض يتجاوز المبلغ المتبقي من سومة الكبير',
  NO_OFFER: 'لا يوجد عرض حالي للرد عليه',
  INVALID_RESPONSE: 'رد غير صالح',
};

interface Session {
  playerId: string;
  roomCode: string;
  name: string;
}

const SESSION_KEY = 'mdaqash:session';
const NAME_KEY = 'mdaqash:name';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null): void {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

interface Store {
  connected: boolean;
  room: ClientRoomState | null;
  name: string;
  toast: string | null;
  busy: boolean;

  setName(name: string): void;
  showToast(message: string): void;
  createRoom(name: string): Promise<void>;
  joinRoom(name: string, code: string): Promise<void>;
  leaveRoom(): void;
  updateSettings(settings: Partial<RoomSettings>): Promise<void>;
  enter(amount: number): Promise<void>;
  fold(): Promise<void>;
  offer(amount: number): Promise<void>;
  respondOffer(response: NegotiationResponse): Promise<void>;
  preselect(response: NegotiationResponse | null): Promise<void>;
  nextRound(): Promise<void>;
  playAgain(): Promise<void>;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<Store>()((set, get) => ({
  connected: socket.connected,
  room: null,
  name: localStorage.getItem(NAME_KEY) ?? '',
  toast: null,
  busy: false,

  setName: (name) => {
    localStorage.setItem(NAME_KEY, name);
    set({ name });
  },

  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => set({ toast: null }), 3500);
  },

  createRoom: async (name) => {
    set({ busy: true });
    const res = await emitAck<{ roomCode: string; playerId: string }>('room:create', { name });
    set({ busy: false });
    if (res.ok && res.data) {
      saveSession({ playerId: res.data.playerId, roomCode: res.data.roomCode, name });
      get().setName(name);
    } else if (!res.ok) {
      get().showToast(ERROR_AR[res.error] ?? res.error);
    }
  },

  joinRoom: async (name, code) => {
    set({ busy: true });
    const res = await emitAck<{ roomCode: string; playerId: string }>('room:join', {
      name,
      roomCode: code,
    });
    set({ busy: false });
    if (res.ok && res.data) {
      saveSession({ playerId: res.data.playerId, roomCode: res.data.roomCode, name });
      get().setName(name);
    } else if (!res.ok) {
      get().showToast(ERROR_AR[res.error] ?? res.error);
    }
  },

  leaveRoom: () => {
    socket.emit('room:leave');
    saveSession(null);
    set({ room: null });
  },

  updateSettings: async (settings) => {
    const res = await emitAck('room:updateSettings', settings);
    if (!res.ok) get().showToast(ERROR_AR[res.error] ?? res.error);
  },

  enter: async (amount) => {
    const res = await emitAck('game:enter', { amount });
    if (!res.ok) get().showToast(ERROR_AR[res.error] ?? res.error);
  },

  fold: async () => {
    const res = await emitAck('game:fold');
    if (!res.ok) get().showToast(ERROR_AR[res.error] ?? res.error);
  },

  offer: async (amount) => {
    const res = await emitAck('game:offer', { amount });
    if (!res.ok) get().showToast(ERROR_AR[res.error] ?? res.error);
  },

  respondOffer: async (response) => {
    const res = await emitAck('game:respond', { response });
    if (!res.ok) get().showToast(ERROR_AR[res.error] ?? res.error);
  },

  preselect: async (response) => {
    const res = await emitAck('game:preselect', { response });
    if (!res.ok) get().showToast(ERROR_AR[res.error] ?? res.error);
  },

  nextRound: async () => {
    const res = await emitAck('game:nextRound');
    if (!res.ok) get().showToast(ERROR_AR[res.error] ?? res.error);
  },

  playAgain: async () => {
    const res = await emitAck('game:playAgain');
    if (!res.ok) get().showToast(ERROR_AR[res.error] ?? res.error);
  },
}));

/* ---------------- ربط أحداث السوكت بالمخزن ---------------- */

socket.on('connect', () => {
  useStore.setState({ connected: true });
  // محاولة استعادة الجلسة بعد انقطاع/تحديث الصفحة
  const session = loadSession();
  if (session) {
    void emitAck('room:rejoin', {
      roomCode: session.roomCode,
      playerId: session.playerId,
    }).then((res) => {
      if (!res.ok) {
        saveSession(null);
        useStore.setState({ room: null });
        useStore.getState().showToast(ERROR_AR[res.error] ?? 'انتهت الجلسة');
      }
    });
  }
});

socket.on('disconnect', () => {
  useStore.setState({ connected: false });
});

socket.on('room:state', (state: ClientRoomState) => {
  useStore.setState({ room: state });
});

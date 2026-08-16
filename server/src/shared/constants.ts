/**
 * ثوابت اللعبة المشتركة بين السيرفر والواجهة.
 * السيرفر هو المصدر الوحيد للحقيقة — هذه الثوابت تستخدم للتحقق من صحة المدخلات.
 */

/** عدد اللاعبين في الغرفة — دائمًا 4 لاعبين حقيقيين */
export const PLAYER_COUNT = 4;

/** عدد الأوراق في المجموعة: 4 آكه + 4 شايب + 4 بنت + 4 ولد */
export const DECK_SIZE = 16;

/** عدد الأوراق لكل لاعب */
export const CARDS_PER_PLAYER = 4;

/** الحد الأدنى للدخول */
export const MIN_BET = 500;

/** جميع مبالغ الدخول يجب أن تكون من مضاعفات 500 */
export const BET_STEP = 500;

/** هدف الفوز يجب أن يكون من مضاعفات المليون */
export const WIN_GOAL_STEP = 1_000_000;

/** الرصيد الافتراضي عند بدء اللعبة */
export const DEFAULT_START_BALANCE = 5_000;

/** هدف الفوز الافتراضي */
export const DEFAULT_WIN_GOAL = 1_000_000;

/** خيارات رصيد البداية المتاحة لصاحب الغرفة */
export const START_BALANCE_PRESETS = [5_000, 10_000, 50_000, 100_000] as const;

/** خيارات هدف الفوز المتاحة (كلها مضاعفات المليون) */
export const WIN_GOAL_PRESETS = [1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000] as const;

/** مدة العد التنازلي قبل توزيع الأوراق */
export const COUNTDOWN_MS = 3_000;

/** مدة أنيميشن توزيع الأوراق قبل بدء المراهنة */
export const DEALING_MS = 2_600;

/** مهلة اللاعب غير المتصل قبل تنفيذ إجراء تلقائي عنه */
export const DISCONNECTED_TURN_TIMEOUT_MS = 20_000;

/** مهلة بقاء المقعد محجوزًا في الانتظار بعد الانقطاع */
export const LOBBY_SEAT_GRACE_MS = 60_000;

/** مهلة حذف الغرفة عند انقطاع جميع اللاعبين */
export const EMPTY_ROOM_TTL_MS = 5 * 60_000;

/**
 * اختبار E2E حقيقي: يشغّل سيرفر الإنتاج المبني (dist) ويوصّل 4 عملاء Socket.IO
 * ويلعب جولتين كاملتين مع فحص كل القواعد (الأدوار، المبالغ، الخصوصية، الاستعادة).
 *
 * التشغيل: npm run build && npm run smoke
 */
import { spawn } from 'child_process';
import { io as ioc, Socket } from 'socket.io-client';
import type { Ack, ClientRoomState } from '../server/src/shared/types';

const PORT = 3999;
const URL = `http://127.0.0.1:${PORT}`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, label: string, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`TIMEOUT: ${label}`);
    await wait(100);
  }
}

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

class TestClient {
  socket: Socket;
  state: ClientRoomState | null = null;
  playerId = '';
  constructor(public name: string) {
    this.socket = ioc(URL, { transports: ['websocket'] });
    this.socket.on('room:state', (s: ClientRoomState) => {
      this.state = s;
    });
  }
  ack<T = undefined>(event: string, payload?: unknown): Promise<Ack<T>> {
    return new Promise((resolve) => {
      this.socket
        .timeout(5000)
        .emit(event, payload ?? {}, (err: unknown, res: Ack<T>) =>
          resolve(err || !res ? { ok: false, error: 'NETWORK', message: 'NETWORK' } : res),
        );
    });
  }
  get me() {
    return this.state?.players.find((p) => p?.id === this.state?.youId) ?? null;
  }
  async waitPhase(phase: string, timeout = 20000): Promise<void> {
    await waitFor(() => this.state?.phase === phase, `${this.name} → phase=${phase}`, timeout);
  }
}

async function main(): Promise<void> {
  console.log('🚀 تشغيل سيرفر الإنتاج (dist/index.js)…');
  const server = spawn(process.execPath, ['dist/index.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  server.stdout?.on('data', (d) => {
    if (String(d).includes('listening')) ready = true;
  });
  server.stderr?.on('data', (d) => console.error('[server]', String(d)));
  process.on('exit', () => server.kill());
  await waitFor(() => ready, 'server listen');
  check(true, 'السيرفر يعمل');

  // فحص HTTP: الصحة + خدمة الواجهة
  const health = (await (await fetch(`${URL}/health`)).json()) as { ok: boolean };
  check(health.ok === true, 'نقطة /health تعمل');
  const html = await (await fetch(`${URL}/`)).text();
  check(html.includes('id="root"'), 'الواجهة المبنية تُخدم من السيرفر');

  const clients = ['نواف', 'أحمد', 'خالد', 'محمد'].map((n) => new TestClient(n));
  const [a, b, c, d] = clients;
  await Promise.all(clients.map((t) => waitFor(() => t.socket.connected, `connect ${t.name}`)));

  console.log('\n📦 إنشاء الغرفة والانضمام');
  const created = await a.ack<{ roomCode: string; playerId: string }>('room:create', { name: a.name });
  check(created.ok && !!created.data, 'إنشاء الغرفة');
  const code = created.data!.roomCode;
  a.playerId = created.data!.playerId;
  check(/^MDQ-\d{4}$/.test(code), `كود الغرفة بصيغة MDQ-XXXX (${code})`);

  const badSettings = await a.ack('room:updateSettings', { winGoal: 1_500_000 });
  check(!badSettings.ok && badSettings.error === 'INVALID_SETTINGS', 'رفض هدف 1,500,000 (ليس من مضاعفات المليون)');
  const goodSettings = await a.ack('room:updateSettings', { winGoal: 2_000_000, startingBalance: 5000 });
  check(goodSettings.ok, 'قبول هدف 2,000,000 ورصيد 5,000');

  for (const t of [b, c, d]) {
    const res = await t.ack<{ roomCode: string; playerId: string }>('room:join', {
      name: t.name,
      roomCode: code,
    });
    check(res.ok, `انضمام ${t.name}`);
    t.playerId = res.data!.playerId;
  }

  console.log('\n⏳ العد التنازلي والتوزيع');
  await a.waitPhase('countdown');
  check(true, 'اكتمال 4/4 يبدأ العد التنازلي تلقائيًا');
  await a.waitPhase('betting');
  await Promise.all([b, c, d].map((t) => t.waitPhase('betting')));
  check(true, 'توزيع 16 ورقة وبدء المراهنة');

  console.log('\n🃏 خصوصية الأوراق');
  for (const t of clients) {
    check(t.me?.cards?.length === 4, `${t.name} يرى أوراقه الأربع`);
    const others = t.state!.players.filter((p) => p && p.id !== t.state!.youId);
    check(others.every((p) => p!.cards === null), `${t.name} لا يرى أوراق الآخرين`);
  }

  console.log('\n🎯 قاعدة يمين الموزع والتحققات');
  const dealerIdx = a.state!.dealerIndex;
  const forcedIdx = (dealerIdx + 1) % 4;
  check(a.state!.turnIndex === forcedIdx, 'الدور الأول للاعب يمين الموزع');
  const bySeat = (idx: number) => clients.find((t) => t.me?.seatIndex === idx)!;
  const forced = bySeat(forcedIdx);

  const foldRes = await forced.ack('game:fold');
  check(!foldRes.ok && foldRes.error === 'FORCED_MUST_ENTER', 'يمين الموزع لا يستطيع الانسحاب');
  const zeroRes = await forced.ack('game:enter', { amount: 0 });
  check(!zeroRes.ok && zeroRes.error === 'MIN_BET', 'يمين الموزع لا يستطيع الدخول بـ 0');
  const badAmt = await forced.ack('game:enter', { amount: 700 });
  check(!badAmt.ok && badAmt.error === 'INVALID_AMOUNT', 'رفض 700 (ليس من مضاعفات 500)');
  const overRes = await forced.ack('game:enter', { amount: 100_000 });
  check(!overRes.ok && overRes.error === 'INSUFFICIENT_BALANCE', 'رفض تجاوز الرصيد');
  const notTurn = await bySeat((forcedIdx + 1) % 4).ack('game:enter', { amount: 500 });
  check(!notTurn.ok && notTurn.error === 'NOT_YOUR_TURN', 'لا يمكن اللعب خارج الدور');

  console.log('\n💰 لعب الجولة الأولى');
  check((await forced.ack('game:enter', { amount: 1000 })).ok, 'المجبر يدخل بـ 1000');
  check((await bySeat((forcedIdx + 1) % 4).ack('game:fold')).ok, 'لاعب اختياري ينسحب');
  check((await bySeat((forcedIdx + 2) % 4).ack('game:enter', { amount: 500 })).ok, 'لاعب يدخل بـ 500');
  check((await bySeat((forcedIdx + 3) % 4).ack('game:enter', { amount: 500 })).ok, 'الموزع (آخر الأدوار) يدخل');

  console.log('\n🤝 مرحلة المفاوضة');
  await a.waitPhase('negotiation');
  const neg0 = a.state!.negotiation!;
  check(neg0.bigPlayerId === forced.playerId, 'الكبير = صاحب أعلى سومة (المجبر بـ 1000)');
  check(neg0.highestEntry === 1000 && neg0.remainingBudget === 1000, 'ميزانية المفاوضة = سومة الكبير');
  check(neg0.order.length === 2, 'المفاوَضون = الداخلون الآخرون (2)');
  const secondTarget = clients.find((t) => t.playerId === neg0.order[1])!;
  check(
    (await secondTarget.ack('game:preselect', { response: 'no_cards' })).ok,
    'حفظ اختيار مسبق «لا ورق» من اللاعب التالي',
  );
  const big = clients.find((t) => t.playerId === neg0.bigPlayerId)!;
  const badOffer = await big.ack('game:offer', { amount: 2000 });
  check(!badOffer.ok && badOffer.error === 'EXCEEDS_BUDGET', 'رفض عرض يتجاوز ميزانية المفاوضة');
  // الكبير يفاوض الجميع بـ 500 — الأول يرد يدويًا، والثاني يُطبَّق اختياره المسبق تلقائيًا
  let negGuard = 0;
  while (a.state!.phase === 'negotiation' && negGuard++ < 10) {
    const neg = a.state!.negotiation!;
    if (neg.currentOffer === null) {
      const bigNow = clients.find((t) => t.playerId === neg.bigPlayerId)!;
      await bigNow.ack('game:offer', { amount: 500 });
    } else {
      const targetNow = clients.find((t) => t.playerId === neg.currentTargetId)!;
      await targetNow.ack('game:respond', { response: 'no_cards' });
    }
    await wait(150);
  }
  await a.waitPhase('showdown');
  check(a.state!.negotiation!.log.length === 2, 'سجل المفاوضة اكتمل ويراه الجميع (عرضان/ردان)');
  check(a.state!.negotiation!.log.some((e) => e.auto), 'الاختيار المسبق طُبِّق تلقائيًا وظهر في السجل');
  const res = a.state!.result!;
  check(res.winnerIds.length >= 1, 'إعلان الفائز');
  check(res.pot === 2000, `الجائزة = 2,000 (الفعلي: ${res.pot})`);
  const total = a.state!.players.reduce((s, p) => s + (p?.balance ?? 0), 0);
  check(total === 20000, `حفظ مجموع الأرصدة (${total})`);
  const winnerHand = res.hands.find((h) => h.playerId === res.winnerIds[0]);
  check(!!winnerHand && winnerHand.entered && winnerHand.cards.length === 4, 'كشف يد الفائز');
  check(res.hands.some((h) => !h.entered && h.cards.length === 0), 'أوراق المنسحب لا تُكشف');

  console.log('\n🔄 الجولة الثانية وتدوير الموزع');
  check((await a.ack('game:nextRound')).ok, 'بدء الجولة التالية');
  await a.waitPhase('betting');
  check(a.state!.dealerIndex === (dealerIdx + 1) % 4, 'تدوير الموزع');
  check(a.state!.roundNumber === 2, 'رقم الجولة = 2');
  check(a.state!.turnIndex === (a.state!.dealerIndex + 1) % 4, 'الدور ليمين الموزع الجديد');

  console.log('\n🔌 الانقطاع واستعادة الجلسة');
  const cSession = { roomCode: code, playerId: c.playerId };
  c.socket.disconnect();
  await waitFor(
    () => a.state?.players.find((p) => p?.id === cSession.playerId)?.connected === false,
    'ظهور خالد كغير متصل',
  );
  check(true, 'مؤشر 🔴 للاعب غير المتصل أثناء الجولة');
  const c2 = new TestClient('خالد');
  await waitFor(() => c2.socket.connected, 'c2 connect');
  const rej = await c2.ack('room:rejoin', cSession);
  check(rej.ok, 'استعادة الجلسة بعد الانقطاع');
  await waitFor(() => (c2.me?.cards?.length ?? 0) === 4, 'خالد استعاد أوراقه');
  check(true, 'اللاعب العائد يرى أوراقه ويكمل نفس الجولة');

  console.log('\n🚫 حماية الغرفة');
  const e = new TestClient('زايد');
  await waitFor(() => e.socket.connected, 'e connect');
  const joinMid = await e.ack('room:join', { name: 'زايد', roomCode: code });
  check(!joinMid.ok && joinMid.error === 'GAME_IN_PROGRESS', 'منع انضمام لاعب خامس أثناء اللعب');
  const joinBad = await e.ack('room:join', { name: 'زايد', roomCode: 'MDQ-0000' });
  check(!joinBad.ok && joinBad.error === 'ROOM_NOT_FOUND', 'كود غرفة خاطئ مرفوض');

  console.log(`\n✅ نجحت جميع الفحوص (${passed} فحصًا) — اللعبة تعمل End-to-End`);
  server.kill();
  process.exit(0);
}

main().catch((e: Error) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});


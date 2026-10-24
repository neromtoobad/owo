import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { encodeAbiParameters, formatUnits, isAddress, keccak256, parseEventLogs, type Address, type Hex } from 'viem';
import { config } from './config.ts';
import { deskAbi } from './abi.ts';
import { account, desk, deskParams, dexExit, pub, readOrder, relayerAccount, serial, wallet } from './chain.ts';
import * as paycrest from './paycrest.ts';
import { store } from './store.ts';
import { kick, quoteNaira } from './worker.ts';
import { planRedemption } from './redeem.ts';

export const app = new Hono();

const ROUTES = ['wallet', 'permit', 'borrow'] as const;

// Keep the relayer's gas from being farmed: a few relays per address per hour.
const hits = new Map<string, number[]>();
function limited(key: string, max = 8, windowMs = 3600_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}

app.onError((e, c) => {
  console.error(c.req.path, e.message);
  return c.json({ error: e.message.replace(/\s+/g, ' ').slice(0, 240) }, 500);
});

app.get('/api/health', async (c) => {
  const bal = relayerAccount ? await pub.getBalance({ address: relayerAccount.address }) : 0n;
  return c.json({
    ok: true,
    net: config.net,
    desk: config.desk ?? null,
    relayer: relayerAccount?.address ?? null,
    relayerBtc: formatUnits(bal, 18),
    live: config.live,
    paycrestKey: Boolean(config.paycrestKey),
  });
});

app.get('/api/config', async (c) => {
  const p = config.desk ? await deskParams() : null;
  let paycrestRate: number | null = null;
  try {
    paycrestRate = await paycrest.rate(100);
  } catch {}
  return c.json({
    net: config.net,
    chainId: config.chainId,
    chainName: config.chainName,
    rpc: config.rpc,
    explorer: config.explorer,
    desk: config.desk ?? null,
    musd: config.musd,
    borrowerOpsSignatures: config.borrowerOpsSignatures,
    relayer: relayerAccount?.address ?? null,
    feeBps: config.feeBps,
    slippageBps: config.slippageBps,
    minOrder: p ? formatUnits(p.minOrder, 18) : '1',
    maxOrder: p ? formatUnits(p.maxOrder, 18) : '2000',
    dayRoom: p ? formatUnits(p.dayRoom, 18) : '0',
    settleWindowSec: p ? Number(p.settleWindow) : 21600,
    mode: config.live ? 'live' : 'demo',
    liveOwners: config.net === 'testnet' ? config.liveOwners : [],
    paycrestRate,
  });
});

app.get('/api/banks', async (c) => c.json(await paycrest.banks()));

app.post('/api/account/verify', async (c) => {
  const { institution, accountIdentifier } = await c.req.json<{ institution: string; accountIdentifier: string }>();
  if (!/^[A-Z0-9]{4,16}$/.test(institution ?? '') || !/^\d{10}$/.test(accountIdentifier ?? '')) {
    return c.json({ error: 'Pick a bank and enter a 10-digit account number' }, 400);
  }
  if (limited(`verify:${c.req.header('x-forwarded-for') ?? 'local'}`, 30)) return c.json({ error: 'Too many lookups, try again soon' }, 429);
  try {
    return c.json({ accountName: await paycrest.verifyAccount(institution, accountIdentifier) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

app.get('/api/quote', async (c) => {
  const musd = Number(c.req.query('musd'));
  if (!Number.isFinite(musd) || musd <= 0 || musd > 1_000_000) return c.json({ error: 'Enter an amount' }, 400);
  const rate = await paycrest.rate(musd);
  const q = quoteNaira(musd, rate);
  const minNaira = Math.floor(q.naira * (1 - config.slippageBps / 10_000));
  const dex = await dexExit(musd);
  // What the desk's own exit costs: a live redemption plan from Mezo's HintHelpers.
  let redeem = { usdOut: musd * (1 - config.redemptionFeeBps / 10_000), lossPct: config.redemptionFeeBps / 100, live: false };
  try {
    const p = await planRedemption(musd);
    if (Number(p.musd) > 0) redeem = { ...redeem, lossPct: p.lossPct, live: true };
  } catch {}
  return c.json({
    musd,
    rate,
    feeBps: config.feeBps,
    feeMusd: q.feeMusd,
    usdc: q.usdc,
    naira: q.naira,
    minNaira,
    dex: dex ? { musdIn: musd, usdOut: dex.usdOut, lossPct: dex.lossPct, naira: Math.floor(dex.usdOut * rate) } : null,
    redeem,
    expiresAt: Date.now() + 60_000,
  });
});

/** Salted hash of the bank details: what goes on-chain. The details stay here. */
function recipientHash(r: { institution: string; accountIdentifier: string; accountName: string; salt: string }): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'string' }, { type: 'string' }, { type: 'string' }],
      [r.salt as Hex, r.institution, r.accountIdentifier, r.accountName],
    ),
  );
}

app.post('/api/recipients', async (c) => {
  const b = await c.req.json<{ institution: string; accountIdentifier: string; accountName: string; salt: string }>();
  if (!/^0x[0-9a-fA-F]{64}$/.test(b.salt ?? '')) return c.json({ error: 'Bad salt' }, 400);
  if (!/^\d{10}$/.test(b.accountIdentifier ?? '')) return c.json({ error: 'Bad account number' }, 400);
  const banks = await paycrest.banks();
  const bank = banks.find((x) => x.code === b.institution);
  if (!bank) return c.json({ error: 'Unknown bank' }, 400);
  // Trust the name only from our own lookup, never from the client.
  let accountName: string;
  try {
    accountName = await paycrest.verifyAccount(b.institution, b.accountIdentifier);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const rec = { institution: b.institution, accountIdentifier: b.accountIdentifier, accountName, salt: b.salt };
  const hash = recipientHash(rec);
  store.putRecipient(hash, { ...rec, bankName: bank.name, createdAt: Date.now() });
  return c.json({ recipientHash: hash, accountName });
});

app.get('/api/account/:address', async (c) => {
  const a = c.req.param('address');
  if (!isAddress(a)) return c.json({ error: 'Bad address' }, 400);
  return c.json(await account(a as Address));
});

type Intent = { owner: Address; amount: string; minNaira: string; recipientHash: Hex; deadline: string };

function intentArg(i: Intent) {
  if (!isAddress(i?.owner)) throw new Error('Bad intent');
  return {
    owner: i.owner,
    amount: BigInt(i.amount),
    minNaira: BigInt(i.minNaira),
    recipientHash: i.recipientHash,
    deadline: BigInt(i.deadline),
  };
}

async function relay(c: { req: { header(k: string): string | undefined } }, intent: Intent, functionName: string, args: unknown[]) {
  if (!wallet || !relayerAccount) throw new Error('Relayer is not configured');
  if (!store.recipient(intent.recipientHash)) throw new Error('Register the bank details first');
  if (limited(`relay:${intent.owner.toLowerCase()}`) || limited(`relayip:${c.req.header('x-forwarded-for') ?? 'local'}`, 20)) {
    throw new Error('Too many cash-outs in the last hour');
  }
  // Simulate first so a bad signature costs the relayer nothing.
  const { request } = await pub.simulateContract({
    address: desk(),
    abi: deskAbi,
    functionName,
    args,
    account: relayerAccount,
  } as never);
  const w = wallet;
  const { hash, receipt } = await serial(async () => {
    const hash = await w.writeContract(request as never);
    return { hash, receipt: await pub.waitForTransactionReceipt({ hash, timeout: 90_000 }) };
  });
  if (receipt.status !== 'success') throw new Error(`Transaction reverted (${hash})`);
  const [ev] = parseEventLogs({ abi: deskAbi, logs: receipt.logs, eventName: 'Opened' }) as unknown as { args: { id: bigint } }[];
  const orderId = Number(ev.args.id);
  kick(orderId, hash, intent.owner);
  return { txHash: hash, orderId };
}

function revertReason(e: Error) {
  const m = e.message;
  const known = m.match(/(BadSignature|Expired|BadAmount|OverDayCap|Paused|BadRecipient|MintMismatch|Invalid signature|Signature expired|ICR|TCR|[A-Za-z]+: [^\n"]+)/);
  return known ? known[0] : m.split('\n')[0];
}

app.post('/api/relay/permit', async (c) => {
  const b = await c.req.json<{ intent: Intent; intentSig: Hex; permitDeadline: string; v: number; r: Hex; s: Hex }>();
  try {
    const out = await relay(c, b.intent, 'cashOutWithPermit', [
      intentArg(b.intent),
      b.intentSig,
      BigInt(b.permitDeadline),
      b.v,
      b.r,
      b.s,
    ]);
    return c.json(out);
  } catch (e) {
    return c.json({ error: revertReason(e as Error) }, 400);
  }
});

app.post('/api/relay/borrow', async (c) => {
  const b = await c.req.json<{ intent: Intent; intentSig: Hex; borrowSig: Hex; borrowDeadline: string }>();
  try {
    const zero = '0x0000000000000000000000000000000000000000';
    const out = await relay(c, b.intent, 'borrowAndCashOut', [
      intentArg(b.intent),
      b.intentSig,
      zero,
      zero,
      b.borrowSig,
      BigInt(b.borrowDeadline),
    ]);
    return c.json(out);
  } catch (e) {
    return c.json({ error: revertReason(e as Error) }, 400);
  }
});

const ROUTE_OF_STEP = (route: number) => ROUTES[route] ?? 'wallet';

async function orderView(id: number) {
  const o = await readOrder(id);
  if (o.status === 'none') return null;
  const m = store.order(id);
  const rec = store.recipient(o.recipientHash);
  let route: string = 'wallet';
  if (m?.openTx) {
    try {
      const receipt = await pub.getTransactionReceipt({ hash: m.openTx as Hex });
      const [ev] = parseEventLogs({ abi: deskAbi, logs: receipt.logs, eventName: 'Opened' }) as unknown as { args: { route: number } }[];
      if (ev) route = ROUTE_OF_STEP(Number(ev.args.route));
    } catch {}
  }
  return {
    id,
    owner: o.owner,
    amount: formatUnits(o.amount, 18),
    minNaira: Number(o.minNaira) / 100,
    paidNaira: Number(o.paidNaira) / 100,
    quotedNaira: m?.naira ?? null,
    rate: m?.rate ?? null,
    status: o.status,
    route,
    openedAt: o.openedAt * 1000,
    takenAt: o.takenAt ? o.takenAt * 1000 : null,
    mezoTx: m?.openTx ?? null,
    takeTx: m?.takeTx ?? null,
    settleTx: m?.settleTx ?? null,
    refundTx: m?.refundTx ?? null,
    error: m?.error ?? null,
    bank: rec ? { name: rec.bankName, last4: rec.accountIdentifier.slice(-4), accountName: rec.accountName } : null,
    payout: {
      mode: m?.mode ?? 'demo',
      paycrestOrderId: m?.paycrestOrderId ?? null,
      paycrestStatus: m?.paycrestStatus ?? null,
      baseTx: m?.baseTx ?? null,
      steps: m?.steps ?? [],
    },
  };
}

app.get('/api/orders/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Bad id' }, 400);
  const v = await orderView(id);
  return v ? c.json(v) : c.json({ error: 'No such order' }, 404);
});

app.get('/api/orders', async (c) => {
  const owner = c.req.query('owner')?.toLowerCase();
  if (!owner || !isAddress(owner)) return c.json([]);
  const { orderCount } = await deskParams();
  const out = [];
  for (let id = Number(orderCount); id >= 1 && out.length < 25; id--) {
    const o = await readOrder(id);
    if (o.owner.toLowerCase() === owner) out.push(await orderView(id));
  }
  return c.json(out);
});

app.get('/api/stats', async (c) => {
  const orders = store.orders();
  const paid = orders.filter((m) => m.closed === 'paid' || m.steps.find((s) => s.key === 'settled')?.done);
  return c.json({
    orders: orders.length,
    paid: paid.length,
    nairaPaid: paid.reduce((t, m) => t + (m.naira ?? 0), 0),
    musdIn: paid.reduce((t, m) => t + (m.usdc ?? 0), 0),
  });
});

// The built web app.
const dist = join(config.root, 'web', 'dist');
if (existsSync(dist)) {
  const rel = relative(process.cwd(), dist) || '.';
  app.use('/*', serveStatic({ root: rel }));
  const index = readFileSync(join(dist, 'index.html'), 'utf8');
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.html(index)));
}

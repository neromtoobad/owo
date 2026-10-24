// Watches OwoDesk on Mezo and works each order: check the bank details and the rate,
// take the order, pay the naira out, then settle (or refund if the payout can't happen).
import { keccak256, toBytes, formatUnits, parseEventLogs, type Hex } from 'viem';
import { config, liveFor } from './config.ts';
import { deskAbi } from './abi.ts';
import { desk, deskWrite, pub, readOrder } from './chain.ts';
import { store, step, freshSteps, type OrderMeta } from './store.ts';
import * as paycrest from './paycrest.ts';

const POLL_MS = 4_000;
const MAX_RANGE = 2_000n;
const busy = new Set<number>();

export function quoteNaira(musd: number, rate: number) {
  const feeMusd = (musd * config.feeBps) / 10_000;
  const usdc = Math.floor((musd - feeMusd) * 1e6) / 1e6;
  return { feeMusd, usdc, naira: Math.floor(usdc * rate * 100) / 100 };
}

function meta(id: number, owner: string): OrderMeta {
  const m = store.order(id);
  if (m) return m;
  const mode = liveFor(owner) ? 'live' : 'demo';
  const fresh: OrderMeta = { id, mode, steps: freshSteps(mode), updatedAt: Date.now() };
  store.putOrder(fresh);
  return fresh;
}

async function refund(m: OrderMeta, why: string) {
  m.error = why;
  const { hash } = await deskWrite('reject', [BigInt(m.id)]);
  m.refundTx = hash;
  store.putOrder(m);
  console.log(`order ${m.id}: refunded (${why})`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function work(id: number) {
  if (busy.has(id)) return;
  busy.add(id);
  try {
    const o = await readOrder(id);
    const m = meta(id, o.owner);
    if (o.status === 'paid' || o.status === 'refunded') {
      m.closed = o.status;
      store.putOrder(m);
      return;
    }
    step(m, 'locked');

    const rec = store.recipient(o.recipientHash);
    const musd = Number(formatUnits(o.amount, 18));

    if (o.status === 'open') {
      if (!rec) {
        // The app registers bank details before signing; give a slow client a minute.
        if (Date.now() / 1000 - o.openedAt < 60) return;
        return await refund(m, 'Unknown bank details');
      }
      const rate = await paycrest.rate(musd);
      const q = quoteNaira(musd, rate);
      if (BigInt(Math.floor(q.naira * 100)) < o.minNaira) {
        return await refund(m, `Rate moved: ₦${q.naira.toLocaleString()} is below your floor`);
      }
      if (m.mode === 'live' && rec.institution === paycrest.TEST_BANK.code) {
        Object.assign(m, { mode: 'demo', steps: freshSteps('demo') });
        step(m, 'locked');
      }
      if (m.mode === 'live' && (await paycrest.floatBalance()) < q.usdc) {
        return await refund(m, 'Payout float is low right now');
      }
      Object.assign(m, { rate, usdc: q.usdc, naira: q.naira });
      const { hash } = await deskWrite('take', [BigInt(id)]);
      m.takeTx = hash;
      step(m, 'taken');
    }

    // Taken: pay out exactly once, then settle.
    if (!rec) return await refund(m, 'Unknown bank details');
    if (m.mode === 'live') {
      if (!m.paycrestOrderId) {
        const { orderId, tx } = await paycrest.createOrder(m.usdc!, m.rate!, {
          institution: rec.institution,
          accountIdentifier: rec.accountIdentifier,
          accountName: rec.accountName,
        });
        m.paycrestOrderId = orderId;
        m.baseTx = tx;
        step(m, 'payout');
      }
      for (let i = 0; i < 180; i++) {
        const s = await paycrest.orderStatus(m.paycrestOrderId);
        if (s.status !== m.paycrestStatus) {
          m.paycrestStatus = s.status;
          store.putOrder(m);
        }
        if (s.status === 'settled' || s.status === 'validated') break;
        if (s.status === 'refunded' || s.status === 'expired') {
          return await refund(m, `Paycrest ${s.status} the payout`);
        }
        await sleep(5_000);
      }
      if (m.paycrestStatus !== 'settled' && m.paycrestStatus !== 'validated') return; // keep waiting next round
      step(m, 'bank', `₦${m.naira!.toLocaleString('en-NG')} to ${rec.bankName} ••${rec.accountIdentifier.slice(-4)}`);
    } else {
      // Demo: the same steps on a realistic clock, clearly labelled. No money moves.
      if (!m.steps.find((s) => s.key === 'payout')!.done) {
        await sleep(4_000);
        step(m, 'payout', `₦${m.naira!.toLocaleString('en-NG')} at ₦${m.rate!.toLocaleString('en-NG')}/$ (Paycrest live rate)`);
      }
      if (!m.steps.find((s) => s.key === 'bank')!.done) {
        await sleep(9_000);
        step(m, 'bank', `${rec.bankName} ••${rec.accountIdentifier.slice(-4)} · simulated on testnet`);
      }
    }

    const ref: Hex = m.paycrestOrderId ? (m.paycrestOrderId as Hex) : keccak256(toBytes(`owo-demo:${config.net}:${id}`));
    const { hash } = await deskWrite('settle', [BigInt(id), BigInt(Math.floor(m.naira! * 100)), ref]);
    m.settleTx = hash;
    m.error = undefined;
    step(m, 'settled');
    console.log(`order ${id}: paid ₦${m.naira} (${m.mode})`);
  } catch (e) {
    const m = store.order(id);
    if (m) {
      m.error = (e as Error).message.slice(0, 300);
      store.putOrder(m);
    }
    console.error(`order ${id}:`, (e as Error).message);
  } finally {
    busy.delete(id);
  }
}

/** Record the opening tx for display, from the Opened log. */
function noteOpen(logs: { args: { id?: bigint }; transactionHash: Hex | null }[]) {
  for (const l of logs) {
    if (l.args.id === undefined) continue;
    const id = Number(l.args.id);
    const m = store.order(id);
    if (m && !m.openTx && l.transactionHash) {
      m.openTx = l.transactionHash;
      store.putOrder(m);
    }
  }
}

export async function scan() {
  const head = await pub.getBlockNumber();
  let from = store.cursor ? BigInt(store.cursor) + 1n : head - 5_000n;
  while (from <= head) {
    const to = from + MAX_RANGE > head ? head : from + MAX_RANGE;
    const raw = await pub.getLogs({ address: desk(), fromBlock: from, toBlock: to });
    const logs = parseEventLogs({ abi: deskAbi, logs: raw, eventName: 'Opened' }) as unknown as {
      args: { id: bigint; owner: string };
      transactionHash: Hex;
    }[];
    for (const l of logs) meta(Number(l.args.id), l.args.owner);
    noteOpen(logs);
    store.cursor = Number(to);
    from = to + 1n;
  }
  // Work every order that isn't finished (covers restarts mid-payout).
  for (const m of store.orders()) {
    const last = m.steps.find((s) => s.key === 'settled')!;
    if (!last.done && !m.closed) void work(m.id);
  }
}

export function startWorker() {
  if (!config.desk) {
    console.log('worker: no desk deployed, idle');
    return;
  }
  const loop = async () => {
    try {
      await scan();
    } catch (e) {
      console.error('scan:', (e as Error).message);
    }
    setTimeout(loop, POLL_MS);
  };
  void loop();
  console.log(`worker: watching ${config.desk} on ${config.chainName}`);
}

/** Called right after the relayer submits an order, so it doesn't wait for the next scan. */
export function kick(id: number, openTx: string, owner: string) {
  const m = meta(id, owner);
  m.openTx = openTx;
  store.putOrder(m);
  void work(id);
}

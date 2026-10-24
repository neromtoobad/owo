// Tiny JSON store on the data volume. Bank details live here, never on-chain.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';

export type RecipientRec = {
  institution: string;
  bankName: string;
  accountIdentifier: string;
  accountName: string;
  salt: string;
  createdAt: number;
};

export type Step = { key: string; label: string; at: number | null; done: boolean; note?: string };

export type OrderMeta = {
  id: number;
  mode: 'demo' | 'live';
  openTx?: string;
  takeTx?: string;
  settleTx?: string;
  refundTx?: string;
  usdc?: number;
  rate?: number;
  naira?: number;
  paycrestOrderId?: string;
  baseTx?: string;
  paycrestStatus?: string;
  error?: string;
  closed?: 'paid' | 'refunded';
  steps: Step[];
  updatedAt: number;
};

type Db = { cursor: number; recipients: Record<string, RecipientRec>; orders: Record<string, OrderMeta> };

mkdirSync(config.dataDir, { recursive: true });
const file = join(config.dataDir, `owo-${config.net}.json`);
const db: Db = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { cursor: 0, recipients: {}, orders: {} };

let timer: NodeJS.Timeout | undefined;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    writeFileSync(file + '.tmp', JSON.stringify(db));
    renameSync(file + '.tmp', file);
  }, 200);
}

export const store = {
  get cursor() {
    return db.cursor;
  },
  set cursor(b: number) {
    db.cursor = b;
    save();
  },
  recipient(hash: string): RecipientRec | undefined {
    return db.recipients[hash.toLowerCase()];
  },
  putRecipient(hash: string, r: RecipientRec) {
    db.recipients[hash.toLowerCase()] = r;
    save();
  },
  order(id: number): OrderMeta | undefined {
    return db.orders[id];
  },
  putOrder(m: OrderMeta) {
    m.updatedAt = Date.now();
    db.orders[m.id] = m;
    save();
  },
  orders(): OrderMeta[] {
    return Object.values(db.orders);
  },
};

export function step(m: OrderMeta, key: string, note?: string) {
  const s = m.steps.find((x) => x.key === key);
  if (s && !s.done) {
    s.done = true;
    s.at = Date.now();
    if (note) s.note = note;
  }
  store.putOrder(m);
}

export function freshSteps(mode: 'demo' | 'live'): Step[] {
  const pay = mode === 'live' ? 'USDC sent to Paycrest on Base' : 'Payout order created (demo)';
  const bank = mode === 'live' ? 'Naira sent to your bank' : 'Bank transfer simulated (demo)';
  return [
    { key: 'locked', label: 'MUSD locked on Mezo', at: null, done: false },
    { key: 'taken', label: 'Picked up by the Owo desk', at: null, done: false },
    { key: 'payout', label: pay, at: null, done: false },
    { key: 'bank', label: bank, at: null, done: false },
    { key: 'settled', label: 'Settled on Mezo', at: null, done: false },
  ];
}

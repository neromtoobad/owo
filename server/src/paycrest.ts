// Paycrest: an open off-ramp from stablecoins to bank accounts. Rates, banks and account
// lookup are public; orders are created on-chain at the Gateway contract on Base, with the
// bank details RSA-encrypted to the aggregator's public key (same format as Paycrest's
// own Noblocks app).
import { constants, createPublicKey, publicEncrypt, randomBytes, type KeyObject } from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from './config.ts';
import { erc20Abi, gatewayAbi } from './abi.ts';

const API = config.paycrestApi;

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(15_000) });
  const j = (await r.json().catch(() => ({}))) as { data?: T; message?: string };
  if (!r.ok) throw new Error(j.message ?? `Paycrest ${r.status}`);
  return j.data as T;
}

export type Bank = { name: string; code: string; type?: string };

let banksCache: { at: number; banks: Bank[] } | undefined;
export async function banks(): Promise<Bank[]> {
  if (banksCache && Date.now() - banksCache.at < 6 * 3600_000) return banksCache.banks;
  const list = await get<Bank[]>('/v1/institutions/NGN');
  const banks = list.filter((b) => !b.type || b.type === 'bank').sort((a, b) => a.name.localeCompare(b.name));
  banksCache = { at: Date.now(), banks };
  return banks;
}

const rateCache = new Map<string, { at: number; rate: number }>();
/** NGN per USDC for this order size, as Paycrest quotes it right now. */
export async function rate(usdc: number): Promise<number> {
  const bucket = usdc <= 10 ? 10 : usdc <= 100 ? 100 : usdc <= 1000 ? 1000 : Math.ceil(usdc / 1000) * 1000;
  const key = String(bucket);
  const hit = rateCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.rate;
  const r = Number(await get<string>(`/v1/rates/USDC/${bucket}/NGN`));
  if (!Number.isFinite(r) || r <= 0) throw new Error('No NGN rate from Paycrest');
  rateCache.set(key, { at: Date.now(), rate: r });
  return r;
}

export async function verifyAccount(institution: string, accountIdentifier: string): Promise<string> {
  // Local end-to-end tests only: never look up real people's accounts from a test run.
  if (process.env.OWO_FAKE_VERIFY === '1' && config.rpc.includes('127.0.0.1')) return 'TEST ACCOUNT HOLDER';
  const r = await fetch(`${API}/v1/verify-account`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ institution, accountIdentifier }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { data?: string; message?: string };
  if (!r.ok || !j.data || j.data.trim().length < 3) throw new Error(j.message ?? 'Could not verify this account');
  return j.data.trim();
}

let pubKey: KeyObject | undefined;
async function aggregatorKey(): Promise<KeyObject> {
  if (pubKey) return pubKey;
  const pem = await get<string>('/v1/pubkey');
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
  try {
    pubKey = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    pubKey = createPublicKey({ key: der, format: 'der', type: 'pkcs1' });
  }
  return pubKey;
}

export type Recipient = { institution: string; accountIdentifier: string; accountName: string; memo?: string };

/** The `messageHash` Paycrest's indexer decrypts: RSA PKCS#1 v1.5 of the recipient JSON. */
export async function encryptRecipient(r: Recipient): Promise<string> {
  if (!config.paycrestKey) throw new Error('PAYCREST_API_KEY is not set');
  const payload = {
    accountIdentifier: r.accountIdentifier,
    accountName: r.accountName,
    institution: r.institution,
    memo: r.memo ?? 'Owo cash-out',
    nonce: randomBytes(9).toString('base64url'),
    metadata: { apiKey: config.paycrestKey },
  };
  const key = await aggregatorKey();
  return publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(JSON.stringify(payload))).toString(
    'base64',
  );
}

const RATE_SCALE = 1_000_000;

export function baseClients() {
  if (!config.baseKey) throw new Error('No Base key');
  const account = privateKeyToAccount(config.baseKey);
  const pub = createPublicClient({ chain: base, transport: http(config.baseRpc) });
  const wallet = createWalletClient({ chain: base, transport: http(config.baseRpc), account });
  return { account, pub, wallet };
}

export async function floatBalance(): Promise<number> {
  const { account, pub } = baseClients();
  const bal = await pub.readContract({ address: config.baseUsdc, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  return Number(bal) / 1e6;
}

/** Create a real Paycrest order on Base from the float wallet. Returns the Gateway order id. */
export async function createOrder(usdc: number, ngnRate: number, recipient: Recipient): Promise<{ orderId: Hex; tx: Hex }> {
  const { account, pub, wallet } = baseClients();
  const amount = parseUnits(usdc.toFixed(6), 6);
  const allowance = await pub.readContract({
    address: config.baseUsdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, config.baseGateway],
  });
  if (allowance < amount) {
    const h = await wallet.writeContract({
      address: config.baseUsdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [config.baseGateway, amount * 100n],
    });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  const messageHash = await encryptRecipient(recipient);
  const tx = await wallet.writeContract({
    address: config.baseGateway,
    abi: gatewayAbi,
    functionName: 'createOrder',
    args: [
      config.baseUsdc,
      amount,
      BigInt(Math.round(ngnRate * RATE_SCALE)),
      '0x0000000000000000000000000000000000000000' as Address,
      0n,
      account.address,
      messageHash,
    ],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: tx });
  const [ev] = parseEventLogs({ abi: gatewayAbi, logs: receipt.logs, eventName: 'OrderCreated' });
  if (!ev) throw new Error('No OrderCreated event');
  return { orderId: ev.args.orderId, tx };
}

export type PaycrestStatus = { status: string; txHash?: string; amountInNgn?: number };

/** Gateway order status from the aggregator: pending → processing/validated → settled, or refunded. */
export async function orderStatus(orderId: string): Promise<PaycrestStatus> {
  const r = await fetch(`${API}/v2/orders/8453/${orderId}`, { signal: AbortSignal.timeout(15_000) });
  const j = (await r.json().catch(() => ({}))) as { data?: Record<string, unknown> };
  const d = j.data ?? {};
  return { status: String(d.status ?? 'pending').toLowerCase(), txHash: d.txHash ? String(d.txHash) : undefined };
}

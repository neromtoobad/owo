// End-to-end on a local anvil fork of Mezo testnet:
//   anvil --fork-url https://rpc.test.mezo.org --port 8646 --chain-id 31611
//   node scripts/e2e-local.ts
// Deploys OwoDesk, opens a real MUSD trove for a test user, starts the relayer against the
// fork, then cashes out both ways (borrow-by-signature and permit) and waits for settlement.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  parseEther,
  parseSignature,
  toHex,
  type Hex,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const RPC = 'http://127.0.0.1:8646';
const PORT = 8788;
const API = `http://127.0.0.1:${PORT}`;
const chain = defineChain({ id: 31611, name: 'mezo-fork', nativeCurrency: { name: 'BTC', symbol: 'BTC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });

const MUSD = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const BO = '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5';
const BOS = '0xD757e3646AF370b15f32EB557F0F8380Df7D639e';
const ORACLE = '0x7b7c000000000000000000000000000000000015';

const art = (name: string, file = name) => JSON.parse(readFileSync(join(root, 'contracts/out', `${file}.sol`, `${name}.json`), 'utf8'));

const pub = createPublicClient({ chain, transport: http(RPC) });
const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });

const relayerKey = generatePrivateKey();
const relayer = privateKeyToAccount(relayerKey);
const user = privateKeyToAccount(generatePrivateKey());
const admin = privateKeyToAccount(generatePrivateKey());

function ok(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  // Mezo's oracle is a precompile; replace it with a contract that reports a fresh price.
  await test.setCode({ address: ORACLE, bytecode: art('MockOracle').deployedBytecode.object });
  for (const a of [relayer, user, admin]) await test.setBalance({ address: a.address, value: parseEther('10') });

  const adminWallet = createWalletClient({ chain, transport: http(RPC), account: admin });
  const deskArt = art('OwoDesk');
  const deployHash = await adminWallet.deployContract({
    abi: deskArt.abi,
    bytecode: deskArt.bytecode.object,
    args: [MUSD, BOS, admin.address, relayer.address, admin.address],
  });
  const desk = (await pub.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;
  ok(desk, `OwoDesk deployed at ${desk}`);

  const userWallet = createWalletClient({ chain, transport: http(RPC), account: user });
  const boAbi = parseAbi(['function openTrove(uint256,address,address) payable']);
  const h = await userWallet.writeContract({ address: BO, abi: boAbi, functionName: 'openTrove', args: [parseEther('2000'), '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'], value: parseEther('0.1') });
  ok((await pub.waitForTransactionReceipt({ hash: h })).status === 'success', 'user opened a real MUSD trove (0.1 BTC, 2,000 MUSD)');

  const server = spawn('node', ['src/main.ts'], {
    cwd: join(root, 'server'),
    env: {
      ...process.env,
      MEZO_RPC: RPC,
      MEZO_NET: 'testnet',
      DESK: desk,
      RELAYER_KEY: relayerKey,
      PORT: String(PORT),
      DATA_DIR: mkdtempSync(join(tmpdir(), 'owo-e2e-')),
      OWO_FAKE_VERIFY: '1',
      LIVE: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.stdout.write(`    [relayer] ${d}`));
  server.stderr.on('data', (d) => process.stdout.write(`    [relayer!] ${d}`));
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(`${API}/api/health`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    const j = async (path: string, body?: unknown) => {
      const r = await fetch(`${API}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
      const out = await r.json();
      if (!r.ok) throw new Error(`${path}: ${JSON.stringify(out)}`);
      return out as any;
    };

    const cfg = await j('/api/config');
    ok(cfg.desk.toLowerCase() === desk.toLowerCase(), `config serves the desk (rate ₦${cfg.paycrestRate}/$)`);
    const banks = await j('/api/banks');
    const gtb = banks.find((b: any) => b.code === 'GTBINGLA');
    ok(gtb, `${banks.length} Nigerian banks from Paycrest`);

    const acct = await j(`/api/account/${user.address}`);
    ok(acct.trove && Number(acct.trove.borrowable) > 100, `account sees the trove (ICR ${acct.trove.icr.toFixed(0)}%, can borrow ${acct.trove.borrowable})`);

    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const { recipientHash } = await j('/api/recipients', { institution: 'GTBINGLA', accountIdentifier: '0123456789', accountName: 'ignored', salt });
    ok(recipientHash, 'bank details registered, only a hash goes on-chain');

    // ---- Route 1: borrow by signature, zero gas for the user
    const q = await j('/api/quote?musd=150');
    ok(q.naira > 0 && q.minNaira < q.naira, `quote: 150 MUSD → ₦${q.naira.toLocaleString()} (floor ₦${q.minNaira.toLocaleString()}); DEX loss ${q.dex?.lossPct?.toFixed(2)}%`);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    const amount = parseEther('150');
    const intent = { owner: user.address, amount, minNaira: BigInt(q.minNaira * 100), recipientHash, deadline };
    const intentSig = await user.signTypedData({
      domain: { name: 'Owo', version: '1', chainId: 31611, verifyingContract: desk },
      types: { CashOut: [{ name: 'owner', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'minNaira', type: 'uint256' }, { name: 'recipientHash', type: 'bytes32' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
      primaryType: 'CashOut',
      message: { ...intent, nonce: BigInt(acct.deskNonce) },
    });
    const borrowSig = await user.signTypedData({
      domain: { name: 'BorrowerOperationsSignatures', version: '1', chainId: 31611, verifyingContract: BOS },
      types: { WithdrawMUSD: [{ name: 'amount', type: 'uint256' }, { name: 'borrower', type: 'address' }, { name: 'recipient', type: 'address' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
      primaryType: 'WithdrawMUSD',
      message: { amount, borrower: user.address, recipient: desk, nonce: BigInt(acct.trove.bosNonce), deadline },
    });
    const btcBefore = await pub.getBalance({ address: user.address });
    const strIntent = { owner: user.address, amount: amount.toString(), minNaira: intent.minNaira.toString(), recipientHash, deadline: deadline.toString() };
    const r1 = await j('/api/relay/borrow', { intent: strIntent, intentSig, borrowSig, borrowDeadline: deadline.toString() });
    ok(r1.orderId === 1, `relayed borrow-and-cash-out → order #${r1.orderId}`);
    ok((await pub.getBalance({ address: user.address })) === btcBefore, 'user spent 0 BTC on gas');

    // ---- Route 2: MUSD already in the wallet, permit + intent
    const acct2 = await j(`/api/account/${user.address}`);
    const amount2 = parseEther('80');
    const q2 = await j('/api/quote?musd=80');
    const intent2 = { owner: user.address, amount: amount2, minNaira: BigInt(q2.minNaira * 100), recipientHash, deadline };
    const intentSig2 = await user.signTypedData({
      domain: { name: 'Owo', version: '1', chainId: 31611, verifyingContract: desk },
      types: { CashOut: [{ name: 'owner', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'minNaira', type: 'uint256' }, { name: 'recipientHash', type: 'bytes32' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
      primaryType: 'CashOut',
      message: { ...intent2, nonce: BigInt(acct2.deskNonce) },
    });
    const permit = parseSignature(
      await user.signTypedData({
        domain: { name: 'Mezo USD', version: '1', chainId: 31611, verifyingContract: MUSD },
        types: { Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
        primaryType: 'Permit',
        message: { owner: user.address, spender: desk, value: amount2, nonce: BigInt(acct2.permitNonce), deadline },
      }),
    );
    const r2 = await j('/api/relay/permit', {
      intent: { ...strIntent, amount: amount2.toString(), minNaira: intent2.minNaira.toString() },
      intentSig: intentSig2,
      permitDeadline: deadline.toString(),
      v: Number(permit.v),
      r: permit.r,
      s: permit.s,
    });
    ok(r2.orderId === 2, `relayed permit cash-out → order #${r2.orderId}`);

    // A replayed signature must not open a second order.
    const replay = await fetch(`${API}/api/relay/borrow`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: strIntent, intentSig, borrowSig, borrowDeadline: deadline.toString() }) });
    ok(replay.status === 400, `replayed signature refused (${(await replay.json()).error})`);

    for (const id of [1, 2]) {
      let o: any;
      for (let i = 0; i < 60; i++) {
        o = await j(`/api/orders/${id}`);
        if (o.status === 'paid' || o.status === 'refunded') break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      ok(o.status === 'paid', `order #${id} ${o.route}: paid ₦${o.paidNaira.toLocaleString()} ≥ floor ₦${o.minNaira.toLocaleString()} · steps ${o.payout.steps.filter((s: any) => s.done).length}/5`);
    }
    const stats = await j('/api/stats');
    ok(stats.paid === 2, `stats: ${stats.paid} paid, ₦${Math.round(stats.nairaPaid).toLocaleString()}`);
    const list = await j(`/api/orders?owner=${user.address}`);
    ok(list.length === 2, 'order history lists both');
    console.log('\nE2E PASSED');
  } finally {
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

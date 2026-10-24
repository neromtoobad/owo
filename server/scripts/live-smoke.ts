// Cash out on a deployed Owo (real Mezo testnet) with a test wallet, both routes, to the test bank.
//   OWO_URL=https://… TEST_USER_KEY=0x… node scripts/live-smoke.ts [borrowMusd] [walletMusd]
import { parseEther, parseSignature, toHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const API = process.env.OWO_URL ?? 'http://127.0.0.1:8787';
const user = privateKeyToAccount(process.env.TEST_USER_KEY as Hex);
const [borrowAmt, walletAmt] = [Number(process.argv[2] ?? 50), Number(process.argv[3] ?? 100)];

const j = async (path: string, body?: unknown) => {
  const r = await fetch(`${API}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const out = (await r.json()) as any;
  if (!r.ok) throw new Error(`${path}: ${JSON.stringify(out)}`);
  return out;
};
const CASH_OUT = [
  { name: 'owner', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'minNaira', type: 'uint256' },
  { name: 'recipientHash', type: 'bytes32' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
] as const;

const cfg = await j('/api/config');
const { recipientHash } = await j('/api/recipients', {
  institution: 'OWOTESTX', accountIdentifier: '0123456789', accountName: '', salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
});
const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

async function intent(musd: number, nonce: string) {
  const q = await j(`/api/quote?musd=${musd}`);
  const it = { owner: user.address, amount: parseEther(String(musd)), minNaira: BigInt(q.minNaira * 100), recipientHash, deadline };
  const sig = await user.signTypedData({
    domain: { name: 'Owo', version: '1', chainId: cfg.chainId, verifyingContract: cfg.desk },
    types: { CashOut: CASH_OUT }, primaryType: 'CashOut', message: { ...it, nonce: BigInt(nonce) },
  });
  const str = { owner: it.owner, amount: it.amount.toString(), minNaira: it.minNaira.toString(), recipientHash, deadline: deadline.toString() };
  return { it, str, sig, q };
}

const ids: number[] = [];
if (borrowAmt > 0) {
  const a = await j(`/api/account/${user.address}`);
  const { it, str, sig, q } = await intent(borrowAmt, a.deskNonce);
  const borrowSig = await user.signTypedData({
    domain: { name: 'BorrowerOperationsSignatures', version: '1', chainId: cfg.chainId, verifyingContract: cfg.borrowerOpsSignatures },
    types: { WithdrawMUSD: [{ name: 'amount', type: 'uint256' }, { name: 'borrower', type: 'address' }, { name: 'recipient', type: 'address' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
    primaryType: 'WithdrawMUSD', message: { amount: it.amount, borrower: user.address, recipient: cfg.desk, nonce: BigInt(a.trove.bosNonce), deadline },
  });
  const r = await j('/api/relay/borrow', { intent: str, intentSig: sig, borrowSig, borrowDeadline: deadline.toString() });
  console.log(`borrow ${borrowAmt} MUSD → ₦${q.naira.toLocaleString()} · order #${r.orderId} · ${cfg.explorer}/tx/${r.txHash}`);
  ids.push(r.orderId);
}
if (walletAmt > 0) {
  const a = await j(`/api/account/${user.address}`);
  const { it, str, sig, q } = await intent(walletAmt, a.deskNonce);
  const p = parseSignature(await user.signTypedData({
    domain: { name: 'Mezo USD', version: '1', chainId: cfg.chainId, verifyingContract: cfg.musd },
    types: { Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
    primaryType: 'Permit', message: { owner: user.address, spender: cfg.desk, value: it.amount, nonce: BigInt(a.permitNonce), deadline },
  }));
  const r = await j('/api/relay/permit', { intent: str, intentSig: sig, permitDeadline: deadline.toString(), v: Number(p.v), r: p.r, s: p.s });
  console.log(`wallet ${walletAmt} MUSD → ₦${q.naira.toLocaleString()} · order #${r.orderId} · ${cfg.explorer}/tx/${r.txHash}`);
  ids.push(r.orderId);
}
for (const id of ids) {
  let o: any;
  for (let i = 0; i < 90; i++) {
    o = await j(`/api/orders/${id}`);
    if (o.status === 'paid' || o.status === 'refunded') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`#${id} ${o.status} ₦${o.paidNaira.toLocaleString()} · settle ${o.settleTx ?? '-'} ${o.error ?? ''}`);
}

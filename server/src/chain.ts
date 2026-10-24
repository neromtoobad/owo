import { createPublicClient, createWalletClient, defineChain, formatUnits, http, parseUnits, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from './config.ts';
import { bosAbi, deskAbi, erc20Abi, poolAbi, priceFeedAbi, troveManagerAbi } from './abi.ts';

export const mezo = defineChain({
  id: config.chainId,
  name: config.chainName,
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: [config.rpc] } },
  blockExplorers: { default: { name: 'Mezo Explorer', url: config.explorer } },
});

export const pub = createPublicClient({ chain: mezo, transport: http(config.rpc, { retryCount: 3 }) });

export const relayerAccount = config.relayerKey ? privateKeyToAccount(config.relayerKey) : undefined;
export const wallet = relayerAccount
  ? createWalletClient({ chain: mezo, transport: http(config.rpc), account: relayerAccount })
  : undefined;

const mainnetPub = createPublicClient({ transport: http(config.mainnetRpc, { retryCount: 2 }) });

export function desk(): Address {
  if (!config.desk) throw new Error('OwoDesk is not deployed on this network yet');
  return config.desk;
}

// One relayer account sends everything, so its transactions go out one at a time
// (parallel sends would race for the same nonce).
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Send a desk transaction from the relayer and wait for it. */
export function deskWrite(functionName: string, args: readonly unknown[]) {
  return serial(async () => {
    if (!wallet) throw new Error('RELAYER_KEY is not set');
    const hash = await wallet.writeContract({ address: desk(), abi: deskAbi, functionName, args } as never);
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted (${hash})`);
    return { hash, receipt };
  });
}

export const STATUS = ['none', 'open', 'taken', 'paid', 'refunded'] as const;

export type ChainOrder = {
  owner: Address;
  status: (typeof STATUS)[number];
  openedAt: number;
  takenAt: number;
  amount: bigint;
  minNaira: bigint;
  paidNaira: bigint;
  recipientHash: `0x${string}`;
  payoutRef: `0x${string}`;
};

export async function readOrder(id: number): Promise<ChainOrder> {
  const o = (await pub.readContract({ address: desk(), abi: deskAbi, functionName: 'getOrder', args: [BigInt(id)] })) as {
    owner: Address;
    status: number;
    openedAt: bigint;
    takenAt: bigint;
    amount: bigint;
    minNaira: bigint;
    paidNaira: bigint;
    recipientHash: `0x${string}`;
    payoutRef: `0x${string}`;
  };
  return {
    ...o,
    status: STATUS[o.status],
    openedAt: Number(o.openedAt),
    takenAt: Number(o.takenAt),
  };
}

export async function deskParams() {
  const d = desk();
  const read = (functionName: string) => pub.readContract({ address: d, abi: deskAbi, functionName } as never) as Promise<bigint>;
  const [minOrder, maxOrder, dayRoom, settleWindow, orderCount] = await Promise.all([
    read('minOrder'),
    read('maxOrder'),
    read('dayRoom'),
    read('settleWindow'),
    read('orderCount'),
  ]);
  return { minOrder, maxOrder, dayRoom, settleWindow, orderCount };
}

/** Everything the app needs to know about a wallet before it signs. */
export async function account(addr: Address) {
  const d = config.desk;
  const [musdBalance, btcBalance, permitNonce, deskNonce, troveStatus] = await Promise.all([
    pub.readContract({ address: config.musd, abi: erc20Abi, functionName: 'balanceOf', args: [addr] }),
    pub.getBalance({ address: addr }),
    pub.readContract({ address: config.musd, abi: erc20Abi, functionName: 'nonces', args: [addr] }),
    d ? (pub.readContract({ address: d, abi: deskAbi, functionName: 'nonces', args: [addr] }) as Promise<bigint>) : 0n,
    pub.readContract({ address: config.troveManager, abi: troveManagerAbi, functionName: 'getTroveStatus', args: [addr] }),
  ]);
  let trove = null;
  if (troveStatus === 1) {
    const [coll, debt, price, bosNonce] = await Promise.all([
      pub.readContract({ address: config.troveManager, abi: troveManagerAbi, functionName: 'getTroveColl', args: [addr] }),
      pub.readContract({ address: config.troveManager, abi: troveManagerAbi, functionName: 'getTroveDebt', args: [addr] }),
      pub.readContract({ address: config.priceFeed, abi: priceFeedAbi, functionName: 'fetchPrice' }),
      pub.readContract({ address: config.borrowerOpsSignatures, abi: bosAbi, functionName: 'getNonce', args: [addr] }),
    ]);
    const collUsd = (Number(formatUnits(coll, 18)) * Number(formatUnits(price, 18)));
    const debtN = Number(formatUnits(debt, 18));
    // Keep a safe 150% after borrowing; the 0.1% borrowing fee is added to debt.
    const borrowable = Math.max(0, Math.floor((collUsd / 1.5 - debtN) / 1.001 * 100) / 100);
    trove = {
      coll: formatUnits(coll, 18),
      debt: formatUnits(debt, 18),
      price: Number(formatUnits(price, 18)),
      icr: debtN > 0 ? (collUsd / debtN) * 100 : null,
      borrowable: borrowable.toFixed(2),
      bosNonce: bosNonce.toString(),
    };
  }
  return {
    musdBalance: formatUnits(musdBalance, 18),
    btcBalance: formatUnits(btcBalance, 18),
    permitNonce: permitNonce.toString(),
    deskNonce: deskNonce.toString(),
    trove,
  };
}

/** What selling this much MUSD into Mezo mainnet's MUSD/mUSDC pool returns right now. */
export async function dexExit(musd: number): Promise<{ usdOut: number; lossPct: number } | null> {
  try {
    const out = await mainnetPub.readContract({
      address: config.musdUsdcPool,
      abi: poolAbi,
      functionName: 'getAmountOut',
      args: [parseUnits(musd.toFixed(6), 18), config.mainnetMusd],
    });
    const usdOut = Number(formatUnits(out, 6));
    return { usdOut, lossPct: (1 - usdOut / musd) * 100 };
  } catch {
    return null;
  }
}

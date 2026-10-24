// The treasury's exit: redeem MUSD for BTC at Mezo's flat redemption fee instead of
// selling into thin pools. Redemption takes collateral from the riskiest troves at $1
// per MUSD, which also defends the MUSD peg.
import { createWalletClient, formatUnits, http, parseUnits, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from './config.ts';
import { borrowerOpsAbi, erc20Abi, hintHelpersAbi, priceFeedAbi, sortedTrovesAbi, troveManagerAbi } from './abi.ts';
import { mezo, pub } from './chain.ts';

const MAX_ITERATIONS = 50n;
const NICR_PRECISION = 10n ** 20n;
const MCR = 11n * 10n ** 17n; // 110%
const GAS_COMPENSATION = 200n * 10n ** 18n;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const INTEREST_BUFFER = 10n ** 16n; // 0.01 MUSD

/**
 * How much of `amount` Mezo's TroveManager will actually redeem. It walks troves from
 * the riskiest up: a trove is closed in full if the MUSD covers its net debt; otherwise
 * it is redeemed partially only if that leaves at least minNetDebt, and the walk stops.
 * (HintHelpers.getRedemptionHints keeps walking past a skipped partial, so its
 * truncatedAmount can be more than the TroveManager will take, which reverts.)
 */
async function redeemable(amount: bigint, price: bigint): Promise<{ amount: bigint; minBatch: bigint }> {
  const minNetDebt = await pub.readContract({ address: config.borrowerOps, abi: borrowerOpsAbi, functionName: 'minNetDebt' });
  let cur = await pub.readContract({ address: config.sortedTroves, abi: sortedTrovesAbi, functionName: 'getLast' });
  let remaining = amount;
  let firstNetDebt = 0n;
  for (let i = 0; i < 20 && cur !== ZERO && remaining > 0n; i++) {
    const icr = await pub.readContract({ address: config.troveManager, abi: troveManagerAbi, functionName: 'getCurrentICR', args: [cur, price] });
    if (icr >= MCR) {
      const [, principal, interest] = await pub.readContract({ address: config.troveManager, abi: troveManagerAbi, functionName: 'getEntireDebtAndColl', args: [cur] });
      const netDebt = principal + interest - GAS_COMPENSATION;
      if (firstNetDebt === 0n) firstNetDebt = netDebt;
      if (remaining >= netDebt) remaining -= netDebt;
      else {
        if (netDebt - remaining >= minNetDebt) remaining = 0n;
        break;
      }
    }
    cur = await pub.readContract({ address: config.sortedTroves, abi: sortedTrovesAbi, functionName: 'getPrev', args: [cur] });
  }
  // Debt keeps accruing interest between this read and the transaction, so send a little
  // more than the troves' debt; whatever isn't needed stays with the redeemer.
  const covered = amount - remaining;
  const withBuffer = covered > 0n ? covered + INTEREST_BUFFER : 0n;
  return { amount: withBuffer > amount ? amount : withBuffer, minBatch: firstNetDebt + INTEREST_BUFFER };
}

export type RedemptionPlan = {
  musd: string; // what will actually be redeemed (Mezo may truncate to leave troves above min debt)
  btc: string; // BTC out after the fee
  usd: number; // that BTC at the oracle price
  lossPct: number;
  price: number;
  firstHint: Address;
  upperHint: Address;
  lowerHint: Address;
  partialNICR: bigint;
  truncated: bigint;
  /** MUSD needed to clear the riskiest trove; smaller batches may not redeem at all. */
  minBatch: string;
};

export async function planRedemption(musd: number): Promise<RedemptionPlan> {
  const price = await pub.readContract({ address: config.priceFeed, abi: priceFeedAbi, functionName: 'fetchPrice' });
  const r = await redeemable(parseUnits(musd.toFixed(18), 18), price);
  const amount = r.amount;
  const [firstHint, partialNICR, truncated] =
    amount > 0n
      ? await pub.readContract({
          address: config.hintHelpers,
          abi: hintHelpersAbi,
          functionName: 'getRedemptionHints',
          args: [amount, price, MAX_ITERATIONS],
        })
      : [ZERO, 0n, 0n];
  let upperHint: Address = '0x0000000000000000000000000000000000000000';
  let lowerHint: Address = upperHint;
  if (partialNICR > 0n) {
    // Insert hints for the partially redeemed trove. A stale or missing hint only cancels
    // that last partial step; the full redemptions before it still go through.
    try {
      const [approx] = await pub.readContract({
        address: config.hintHelpers,
        abi: hintHelpersAbi,
        functionName: 'getApproxHint',
        args: [partialNICR, 15n, 42n],
      });
      [upperHint, lowerHint] = await pub.readContract({
        address: config.sortedTroves,
        abi: sortedTrovesAbi,
        functionName: 'findInsertPosition',
        args: [partialNICR, approx, approx],
      });
    } catch {}
  }
  const gross = (truncated * 10n ** 18n) / price; // BTC drawn at $1 per MUSD
  const btcOut = gross - (gross * BigInt(config.redemptionFeeBps)) / 10_000n;
  const priceN = Number(formatUnits(price, 18));
  const usd = Number(formatUnits(btcOut, 18)) * priceN;
  const m = Number(formatUnits(truncated, 18));
  return {
    musd: formatUnits(truncated, 18),
    btc: formatUnits(btcOut, 18),
    usd,
    lossPct: m > 0 ? (1 - usd / m) * 100 : 0,
    price: priceN,
    firstHint,
    upperHint,
    lowerHint,
    partialNICR,
    truncated,
    minBatch: formatUnits(r.minBatch, 18),
  };
}

/** Redeem the treasury's MUSD (or `musd` of it) for BTC. Returns the tx and BTC received. */
export async function redeemTreasury(musd?: number) {
  if (!config.treasuryKey) throw new Error('TREASURY_KEY is not set');
  const account = privateKeyToAccount(config.treasuryKey);
  const wallet = createWalletClient({ chain: mezo, transport: http(config.rpc), account });
  const bal = await pub.readContract({ address: config.musd, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  const want = musd ?? Number(formatUnits(bal, 18));
  if (want <= 0) throw new Error('Treasury holds no MUSD');
  const plan = await planRedemption(Math.min(want, Number(formatUnits(bal, 18))));
  if (plan.truncated === 0n) {
    throw new Error(`Batch too small: Mezo needs ≥ ${Number(plan.minBatch).toFixed(2)} MUSD to clear the riskiest trove`);
  }
  const before = await pub.getBalance({ address: account.address });
  const hash = await wallet.writeContract({
    address: config.troveManager,
    abi: troveManagerAbi,
    functionName: 'redeemCollateral',
    args: [plan.truncated, plan.firstHint, plan.upperHint, plan.lowerHint, plan.partialNICR, MAX_ITERATIONS],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`redeemCollateral reverted (${hash})`);
  const after = await pub.getBalance({ address: account.address });
  const gas = receipt.gasUsed * receipt.effectiveGasPrice;
  return { hash, musd: plan.musd, btc: formatUnits(after - before + gas, 18), plan };
}

export { NICR_PRECISION };

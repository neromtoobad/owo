// Redeem the treasury's MUSD for BTC through Mezo's TroveManager.
//   node scripts/redeem.ts            # everything the treasury holds
//   node scripts/redeem.ts 250        # just 250 MUSD
//   node scripts/redeem.ts --plan 250 # show the plan, send nothing
import { planRedemption, redeemTreasury } from '../src/redeem.ts';

const args = process.argv.slice(2);
const planOnly = args[0] === '--plan';
const amount = Number(planOnly ? args[1] : args[0]) || undefined;

if (planOnly) {
  const p = await planRedemption(amount ?? 100);
  console.log(`redeem ${p.musd} MUSD → ${p.btc} BTC (≈ $${p.usd.toFixed(2)}, cost ${p.lossPct.toFixed(2)}%) at $${p.price.toFixed(0)}/BTC`);
} else {
  const r = await redeemTreasury(amount);
  console.log(`redeemed ${r.musd} MUSD → ${r.btc} BTC · tx ${r.hash}`);
}

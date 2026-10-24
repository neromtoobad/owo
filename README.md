# Owo: your Bitcoin, in naira

**Borrow against your BTC on Mezo and get naira in any Nigerian bank account, with two signatures and no BTC for gas.**

Owo is a cash-out desk for MUSD, Mezo's Bitcoin-backed stablecoin. Today, turning MUSD into money you can spend in Nigeria takes about six steps: swap MUSD on a thin DEX (Mezo's MUSD/USDC pool loses 1.3% on 100 MUSD and 3.8% on 1,000), bridge, send to an exchange, sell P2P, and wait. Owo does it in one step:

1. **Choose an amount.** Draw it from your Mezo trove or use MUSD already in your wallet. You see the naira amount up front at Paycrest's live rate.
2. **Pick your bank** (any of 174 Nigerian banks). Owo shows the account name back to you before you sign.
3. **Sign.** The borrow route takes two signatures and no transactions. Your trove mints MUSD straight into a locked order on the OwoDesk contract, and Owo's relayer pays the gas.
4. **Get paid.** The desk pays the naira out through [Paycrest](https://paycrest.io), an open stablecoin-to-bank network, and only then takes your MUSD.

If the payout can't happen, the contract returns your MUSD:
- **Cancel** any time before the desk picks the order up.
- **Reclaim** if the desk took it but didn't settle within the settle window.
- **Rejected** orders are refunded automatically.

Your MUSD is never released to Owo before your naira has been sent.

## Why it matters for Mezo
- **A real exit for MUSD.** The kickoff Q&A said a borrow-and-cash-out to a bank account ("one click sending USD to my bank account") counts. Owo turns "borrow against BTC" into "pay rent in Lagos" without selling the BTC.
- **Deep integration, not a wrapper.** Owo uses Mezo's own `BorrowerOperationsSignatures`: the user signs `WithdrawMUSD` with the desk as recipient, so the loan and the cash-out happen in one relayed call. The MUSD route uses MUSD's EIP-2612 permit.
- **Built to be cheaper than the DEX.** The desk is designed to exit MUSD through protocol redemption (0.75% fee, `BorrowerOperations.redemptionRate`) rather than the thin pools, and the quote shows the DEX comparison live. The treasury's redemption exit is built (`server/src/redeem.ts`) and runs in the end-to-end test.

## How it works
```
 user (wallet)                    Owo relayer                         Mezo                      Base / Paycrest
 ─────────────                    ───────────                         ────                      ───────────────
 sign WithdrawMUSD (Mezo) ──┐
 sign CashOut intent (Owo) ─┴──►  borrowAndCashOut(...)  ───────────► OwoDesk ── withdrawMUSDWithSignature ──► trove
                                                                        │ MUSD minted into order #N (Open)
                                  sees Opened, checks rate ≥ floor ──► take(N)  (Taken)
                                  createOrder(USDC, rate, enc(bank)) ─────────────────────────────► Gateway → bank
                                  waits for "settled" ◄──────────────────────────────────────────── naira lands
                                  settle(N, paidNaira, paycrestId) ──► OwoDesk → MUSD to treasury (Paid)
```

- **`contracts/src/OwoDesk.sol`**
  - **Ways in:** three routes: `cashOut` (wallet tx), `cashOutWithPermit` (gasless) and `borrowAndCashOut` (gasless, mints from the trove).
  - **Relayer actions:** `take`, `settle` and `reject`.
  - **User exits:** `cancel` (before the desk picks the order up) and `reclaim` (after the settle window).
  - **Signed intent:** the EIP-712 CashOut intent binds the owner, the amount, the naira floor and the hash of the bank details, so a relayed signature can't be redirected to someone else's account.
  - **Limits:** min/max order size, a daily cap and a pause switch. Users can always exit, even while paused.
- **`server/`**, the relayer (Node, viem, Hono):
  - watches the desk and checks the live Paycrest rate against each order's floor;
  - pays out on Base through Paycrest's Gateway (bank details RSA-encrypted to Paycrest's key; only a salted hash goes on-chain), then settles;
  - serves the API and the app.
- **`web/`** is the app (Vite + React + viem).

## Live
- **App:** https://owo.nerom.site (also https://owo-production-f83c.up.railway.app)
- **OwoDesk on Mezo testnet** (chain 31611): [`0x62465d6c87fA5551a379Ca12F135173ed8dAd8CD`](https://explorer.test.mezo.org/address/0x62465d6c87fA5551a379Ca12F135173ed8dAd8CD)
- **First real testnet cash-outs:**
  - [#1](https://owo.nerom.site/order/1): 50 MUSD borrowed from a trove by signature → ₦68,597.78
  - [#2](https://owo.nerom.site/order/2): 120 MUSD from the wallet by permit → ₦164,610.81
- **Try it without real bank details:** pick "Owo Test Bank (testnet demo)" with any 10-digit number.
- **Payouts:** in demo mode on testnet, the payout step is simulated and labelled as such, because test MUSD has no value. Live mode pays real naira through Paycrest. On testnet it's limited to an allow-list (the operator's own wallet), and on mainnet it's open to everyone.

## Tests
```bash
cd contracts && forge test                                         # 25 unit + fuzz tests
forge test --match-contract MezoFork --fork-url https://rpc.test.mezo.org   # real trove, real MUSD, real signatures
anvil --fork-url https://rpc.test.mezo.org --port 8646 --chain-id 31611 &
cd ../server && node scripts/e2e-local.ts                          # contract + relayer + API, both routes, end to end
```
Found while building: `withdrawMUSD` always makes a native call to the recipient for the collateral change, which is 0 BTC when only MUSD is drawn. A contract recipient therefore needs a `receive()`. OwoDesk accepts zero-value calls and refuses real BTC.

## Roadmap
1. Automated float rebalancing (MUSD → BTC by redemption → Base USDC). The redemption exit itself is built: `server/scripts/redeem.ts`, run end to end in `e2e-local.ts`.
2. Opening a new trove inside the same flow (`openTroveWithSignature`), and Mezo Passport so Bitcoin wallets can sign.
3. Mainnet launch with per-user limits, then Ghana and Kenya (Paycrest supports GHS, KES, UGX and TZS).

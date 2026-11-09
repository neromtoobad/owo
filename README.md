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

Your MUSD is never released to Owo before the relayer reports the naira sent.

**Trust model, plainly:** a contract can't see a bank. Settlement rests on the Owo relayer's report that the payout happened, and that report goes on-chain with the Paycrest order id so anyone can check it against Paycrest and Base. The contract enforces everything else: the relayer can only move an order's MUSD to the treasury (on settle) or back to its owner, and the owner can always cancel before pickup or reclaim after the settle window. Everything is public at [/status](https://owo.nerom.site/status).

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

## Wave 2: what changed
The Wave 1 review asked us to fix a High, verify the contract, be honest about trust, show trove risk, and make the full loop real on mainnet. Here's where each one stands:
- **Front-running fixed (was a High).** Anyone could copy a user's `WithdrawMUSD` signature from a pending relay and submit it to Mezo first. That minted MUSD into the desk with no order and no way out. Now `borrowAndCashOut` recognises an already-used signature (it must recover to the owner at the nonce just consumed, with the desk as recipient, can be used only once, and needs that much unassigned MUSD) and opens the order anyway. The desk tracks `lockedMusd`, so the admin can return stray MUSD (`returnUnassigned`) but can never touch order funds. Tested in unit tests, on a fork of real Mezo (testnet **and** mainnet), and end to end through the relayer.
- **Verified contract:** OwoDesk v2 is source-verified on the Mezo explorer.
- **Honest copy:** the app now says settlement rests on the relayer's payout report.
- **Trove risk in the flow:** liquidation price before and after, Mezo's fixed interest rate and what it costs on this borrow, the 0.1% borrowing fee, and a Recovery Mode warning.
- **Redemption health checks:** the treasury reads `getTCR` and `checkRecoveryMode`. It refuses below 110% (where Mezo reverts) and holds redemptions in Recovery Mode.
- **Mainnet safety:** mainnet never simulates payouts, and there's a per-wallet daily cap. A Paycrest rate guard refuses anomalous quotes; Paycrest briefly quoted ₦683/$ against ₦1,373 on Nov 9. The float is checked before an order is taken. See [MAINNET.md](MAINNET.md).
- **Public status page:** reserves, payout float, Mezo TCR and every order, with links to the chain.
- **Mainnet:** the code paths are built and fork-tested on Mezo mainnet. Live Paycrest payouts are switched on with the launch runbook in [MAINNET.md](MAINNET.md).

## Live
- **App:** https://owo.nerom.site · **Status:** https://owo.nerom.site/status
- **OwoDesk v2 on Mezo testnet** (verified): [`0xC20D8c87c03d4a25f78c02db2c586e72e0b340EA`](https://explorer.test.mezo.org/address/0xC20D8c87c03d4a25f78c02db2c586e72e0b340EA?tab=contract)
- **2-minute pitch:** https://youtu.be/76sDNTn-alk
- **Deck:** https://owo.nerom.site/owo-deck.pdf
- **Wave 1 desk (v1)** on Mezo testnet: [`0x62465d6c87fA5551a379Ca12F135173ed8dAd8CD`](https://explorer.test.mezo.org/address/0x62465d6c87fA5551a379Ca12F135173ed8dAd8CD)
- **Wave 1 testnet cash-outs (v1):**
  - [#1](https://owo.nerom.site/order/1): 50 MUSD borrowed from a trove by signature → ₦68,597.78
  - [#2](https://owo.nerom.site/order/2): 120 MUSD from the wallet by permit → ₦164,610.81
- **Try it without real bank details:** pick "Owo Test Bank (testnet demo)" with any 10-digit number.
- **Payouts:** in demo mode on testnet, the payout step is simulated and labelled as such, because test MUSD has no value. Live mode pays real naira through Paycrest. On testnet it's limited to an allow-list (the operator's own wallet), and on mainnet it's open to everyone.

## Tests
```bash
cd contracts && forge test --no-match-contract MezoFork               # 30 unit + fuzz tests (5 front-run cases)
forge test --match-contract MezoFork --fork-url https://rpc.test.mezo.org   # real trove, real MUSD, real signatures
forge test --match-contract MezoFork --fork-url https://mezo.drpc.org       # the same 4 tests on Mezo mainnet
anvil --fork-url https://rpc.test.mezo.org --port 8646 --chain-id 31611 &
cd ../server && node scripts/e2e-local.ts                          # both routes, a live front-run, status, treasury redemption
```
Found while building: `withdrawMUSD` always makes a native call to the recipient for the collateral change, which is 0 BTC when only MUSD is drawn. A contract recipient therefore needs a `receive()`. OwoDesk accepts zero-value calls and refuses real BTC.

## Roadmap
1. Automated float rebalancing (MUSD → BTC by redemption → Base USDC). The redemption exit itself is built: `server/scripts/redeem.ts`, run end to end in `e2e-local.ts`.
2. Opening a new trove inside the same flow (`openTroveWithSignature`), and Mezo Passport so Bitcoin wallets can sign.
3. Mainnet launch with per-user limits, then Ghana and Kenya (Paycrest supports GHS, KES, UGX and TZS).

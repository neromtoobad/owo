# AKINDO form: Owo (paste field by field)

**Product icon:** upload `submission/owo-icon.png` (512×512).

**Product name:** Owo

**Tagline:**
Borrow against your Bitcoin on Mezo and get naira in any Nigerian bank account, with two signatures and no BTC for gas. Owo's contract locks your MUSD, our relayer pays the naira out through Paycrest, and only then is your MUSD released. If anything fails, it comes back to you.

**Product type:** Functional

**Image gallery** (upload all 5, in this order):
1. `submission/gallery/1-title.jpg`
2. `submission/gallery/2-solution.jpg`
3. `submission/gallery/3-product.jpg`
4. `submission/gallery/4-how-it-works.jpg`
5. `submission/gallery/5-proof.jpg`

**About** (paste everything between the lines into the Markdown box):

---
## What it does
Owo is a cash-out desk for **MUSD**, Mezo's Bitcoin-backed stablecoin. You borrow against your BTC and the naira lands in any Nigerian bank account.

1. **Choose an amount.** Draw it from your Mezo trove, or use MUSD already in your wallet. The naira amount is shown up front at Paycrest's live rate.
2. **Pick your bank.** Any of 174 Nigerian banks. Owo reads the account name back to you before you sign.
3. **Sign twice. No transactions, no BTC for gas.**
   - *Borrow route:* you sign Mezo's `WithdrawMUSD` with the OwoDesk contract as recipient, plus an Owo `CashOut` intent. Your trove mints MUSD straight into a locked order.
   - *Wallet route:* you sign an ERC-2612 permit plus the `CashOut` intent.
   - Owo's relayer submits everything.
4. **Get paid.** The relayer checks the live NGN rate against the naira floor you signed and pays out through **Paycrest**, an open stablecoin-to-bank network. Only after the payout does OwoDesk release your MUSD.

If anything fails, your MUSD comes back:
- **cancel** any time before the desk picks the order up;
- **reclaim** it yourself if the desk doesn't settle within the settle window;
- or get an automatic **refund** if the rate moves below your floor.

## The problem it solves
Mezo lets Bitcoin holders borrow MUSD without selling their BTC. In Nigeria, though, MUSD only matters once it becomes naira, and today that takes about six steps: swap on a thin pool, bridge, send to an exchange, then sell peer to peer, losing money at each one. On Oct 24 2026, selling 1,000 MUSD into Mezo mainnet's MUSD/mUSDC pool returned 962 USDC, a 3.8% loss.

Owo turns "borrow against BTC" into "pay rent in Lagos" in one flow. It also gives MUSD a direct exit to a bank account, which the kickoff Q&A named as a Track 2 fit.

## Challenges I ran into
- **Borrowing straight into a contract.** Mezo's `withdrawMUSD` always makes a native call to the recipient for the collateral change, which is 0 BTC when only MUSD is drawn. A contract recipient therefore needs `receive()`, or the whole borrow reverts. OwoDesk accepts zero-value calls and refuses real BTC.
- **Redemptions that revert.** `HintHelpers.getRedemptionHints` can suggest an amount that `TroveManager` won't redeem: a batch smaller than the riskiest trove's whole net debt (about 1,803 MUSD on testnet today) reverts. Interest also accrues between planning and sending. The treasury's planner models the TroveManager's real rule and adds a small interest buffer.
- **Relayed signatures that can't be hijacked.** Mezo's borrow signature and MUSD permits say which contract gets the MUSD, but not which bank account the naira goes to. Owo's EIP-712 `CashOut` intent binds the owner, amount, naira floor and a salted hash of the bank details, so a relayed signature can't be redirected to someone else's account.
- **Testing against a chain with precompiles.** Mezo's oracle is a precompile, which a local fork can't run. We etch a mock oracle in its place so fork tests use real MUSD, real troves and real signatures.

## Technologies I used
- **Mezo:** MUSD (ERC-2612), BorrowerOperationsSignatures, BorrowerOperations, TroveManager, HintHelpers, SortedTroves, PriceFeed.
- **Contracts:** Solidity 0.8.24 (EVM london), Foundry.
- **Relayer:** Node 24, TypeScript, viem, Hono, on Railway.
- **Web:** React, Vite, viem, EIP-712 typed-data signing; mobile-first.
- **Payouts:** Paycrest Gateway on Base, with the recipient RSA-encrypted to the aggregator's key. Only a salted hash of the bank details goes on-chain.

## How we built it
- **OwoDesk** (`contracts/src/OwoDesk.sol`):
  - Three ways in: `cashOut`, `cashOutWithPermit` and `borrowAndCashOut`.
  - Relayer actions `take` / `settle` / `reject`; user actions `cancel` / `reclaim`.
  - Min/max order sizes, a daily cap, and a pause that never blocks a user's exit.
- **Tests:** 25 unit and fuzz tests, including a fuzzed accounting invariant: the desk always holds exactly the open orders' MUSD. Plus 3 fork tests on Mezo testnet with a real trove, real MUSD and real signatures.
- **Relayer:** watches the desk, checks each order against Paycrest's live rate, pays out, then settles. It also serves the API and the app.
- **End-to-end test:** on an anvil fork of Mezo testnet, it runs both routes, a replay attack (refused), settlement, and the treasury redeeming its MUSD for BTC through TroveManager.
- **Paycrest rehearsal:** the live payout call was run against Paycrest's real Base Gateway on a mainnet fork.

## What we learned
- On a young chain, the exit matters as much as the entry. Mezo's pools are thin, but protocol redemption is a flat 0.75% at any size, so a desk that batches into redemptions exits MUSD for less than the DEX. It also takes collateral from the riskiest troves at $1, which supports the peg.
- Gasless UX needs signature design, not just a relayer. The user's intent has to bind every detail the relayer could otherwise change.

## What's next for Owo
1. **Wave 2 (by Nov 15):** real naira payouts.
   - Paycrest sender verification.
   - Live mode on Mezo mainnet with per-user limits.
   - Opening a new trove inside the same flow (`openTroveWithSignature`).
   - Mezo Passport, so Bitcoin wallets can sign.
2. **December:** automated float management. The treasury batches MUSD into redemptions and rebalances into Base USDC for payouts, with public reserves.
3. **Q1 2027:** Ghana (GHS) and Kenya (KES) on the same Paycrest rail, then Uganda and Tanzania, plus a WhatsApp/Telegram front end.

## Submission details
- **Category:** Bitcoin-backed naira off-ramp
- **TL;DR:** Borrow against your BTC on Mezo and get naira in any Nigerian bank account, with two signatures and no BTC for gas.
- **Track:** Track 2: Access and Distribution
- **Chain:** Mezo testnet (chain 31611). Payout rail: Paycrest on Base.
- **Status:** entirely new, built during the hackathon.
- **Readiness:** testnet deployment. OwoDesk is at [`0x62465d6c87fA5551a379Ca12F135173ed8dAd8CD`](https://explorer.test.mezo.org/address/0x62465d6c87fA5551a379Ca12F135173ed8dAd8CD), with real cash-outs settled on-chain:
  - [#1](https://owo.nerom.site/order/1): borrow route, 50 MUSD → ₦68,597.78
  - [#2](https://owo.nerom.site/order/2): wallet route, 120 MUSD → ₦164,610.81
  - [#3](https://owo.nerom.site/order/3): borrow route, 30 MUSD → ₦40,743.94
  - On testnet the bank transfer is simulated and labelled as such, because test MUSD has no value.
- **Try it:** choose "Owo Test Bank (testnet demo)" with any 10-digit number, so no real bank details are needed.
- **Target group:** Nigerians who hold BTC and need naira for rent, school fees, payroll or suppliers without selling their Bitcoin, and Mezo borrowers who want MUSD in a bank account in one step. Mobile-first; built for beginners, with no gas, bridges or exchanges to handle.
- **Business model:** a 1% fee per cash-out, shown up front, which covers the desk's 0.75% redemption exit and gas. Users still get more naira than selling on Mezo's DEX alone.
- **Deck:** https://owo.nerom.site/owo-deck.pdf
- **Team:** neromtoobad, solo builder (contracts, relayer, web, design). [GitHub](https://github.com/neromtoobad) · [X](https://x.com/neromtoobad)
---

**Deliverable URL:** https://github.com/neromtoobad/owo

**Video:** https://youtu.be/76sDNTn-alk

**Live demo:** https://owo.nerom.site

**Build with** (press Enter after each): `Mezo` · `Base` · `Paycrest`

**Product Category** (max 3): `Payments` · `DeFi` · `Off-ramp`

**Tags** (max 10, press Enter after each): `Solidity` · `Foundry` · `TypeScript` · `React` · `Vite` · `viem` · `Hono` · `EIP-712` · `Paycrest` · `Railway`

**Product detail visibility:** Show

**Connect:**
- **X:** https://x.com/neromtoobad
- **Discord, Telegram, Email:** add your own if you want Mezo to reach you there. They contact winners by the email you registered with.

---

# Submit step (the "Updates in this Wave" and "Milestone" boxes)

**Updates in this Wave:**

Wave 1 is Owo's first submission. Everything was built from scratch during this wave.

What shipped (live on Mezo testnet):
- OwoDesk contract on Mezo testnet (0x62465d6c87fA5551a379Ca12F135173ed8dAd8CD). It has three ways in:
  - borrowAndCashOut: borrows from your trove by signature via Mezo's BorrowerOperationsSignatures.
  - cashOutWithPermit: gasless, using an MUSD permit.
  - cashOut: a normal wallet transaction.
- Refund guarantees: cancel before pickup, reclaim after the settle window, automatic refund if the rate drops below your floor.
- An EIP-712 CashOut intent that binds the owner, amount, naira floor and the hash of your bank details.
- Relayer: pays users' gas, checks Paycrest's live NGN rate, pays out through Paycrest's Gateway on Base, then settles on Mezo.
- Treasury exit: redeems MUSD for BTC through Mezo's TroveManager (0.75%) instead of thin DEX pools. The planner handles a redemption edge case we found in HintHelpers.
- Web app (mobile-first): 174 Nigerian banks, account-name check, two signatures, no BTC for gas, a live order tracker.
- Tests: 25 unit and fuzz tests, 3 fork tests on real Mezo testnet troves, and an end-to-end run on a Mezo fork (both routes, a replay attack refused, treasury redemption).
- 3 real cash-outs settled on Mezo testnet: https://owo.nerom.site/order/1 (borrow, 50 MUSD → ₦68,597.78), /order/2 (wallet, 120 MUSD → ₦164,610.81), /order/3 (borrow, 30 MUSD → ₦40,743.94). On testnet the bank transfer is simulated and labelled as such. The live Paycrest payout was rehearsed against Base mainnet's Gateway on a fork.

Links:
- Live: https://owo.nerom.site (try it with "Owo Test Bank (testnet demo)", no real bank details needed)
- Code: https://github.com/neromtoobad/owo
- Video: https://youtu.be/76sDNTn-alk
- Deck: https://owo.nerom.site/owo-deck.pdf

**Milestone · 2nd Wave:**

Real naira on mainnet, by Nov 15:
- Paycrest sender verification and real NGN bank payouts, with live mode on Mezo mainnet and per-user limits.
- Open a new trove inside the same flow, via openTroveWithSignature, so a first-time user goes from BTC to naira in one session.
- Mezo Passport, so Bitcoin wallets (Unisat, OKX, Xverse) can sign.
- First real users from the Mezo Discord and Nigerian BTC holders, with cash-outs published on a public status page.

**Milestone · 3rd Wave:**

Scale the rail, December to Q1 2027:
- Automated float management: the treasury batches MUSD into protocol redemptions and rebalances into Base USDC, with public reserves.
- New corridors on the same Paycrest rail: Ghana (GHS) and Kenya (KES), then Uganda and Tanzania.
- A WhatsApp/Telegram front end for cash-outs and loan-health alerts.

# AKINDO submission: Owo (Mezo Buildathon, Wave 1)

Copy each field into the form.

**Project name:** Owo

**Project category** (3–5 words): Bitcoin-backed naira off-ramp
**Product Category tags** (max 3): Payments · DeFi · Off-ramp

**TL;DR:**
Borrow against your BTC on Mezo and get naira in any Nigerian bank account, with two signatures and no BTC for gas.

**How it works:**

**The problem.** Mezo lets Bitcoin holders borrow MUSD without selling their BTC. For someone in Nigeria, though, MUSD only helps once it becomes naira, and that path is long. You swap on a thin pool, bridge, send to an exchange and sell peer to peer, losing money at each step. On Oct 24 2026, selling 1,000 MUSD into Mezo mainnet's MUSD/mUSDC pool returned 962 USDC, a 3.8% loss.

**The product.** Owo turns borrow → cash-out into one flow:
1. Pick an amount and choose where it comes from:
   - **Borrow against my BTC** draws it from your Mezo trove.
   - **Use MUSD in my wallet** uses MUSD you already hold.
2. Pick one of 174 Nigerian banks. Owo resolves and shows the account name before you sign.
3. Sign twice. You send no transactions and need no BTC for gas: Owo's relayer submits everything.
   - **Borrow route:** you sign Mezo's `WithdrawMUSD` with the OwoDesk contract as recipient, plus an Owo `CashOut` intent. Your trove mints MUSD straight into a locked order.
   - **Wallet route:** you sign an ERC-2612 permit on MUSD plus the `CashOut` intent.
4. The relayer checks Paycrest's live NGN rate against the naira floor you signed, takes the order, and pays out through Paycrest. Paycrest is an open stablecoin-to-bank network; Owo uses its Gateway contract on Base. Only after the payout settles does OwoDesk release the MUSD to Owo's treasury.

**Safety.** If anything fails, your MUSD comes back:
- You can cancel any time before the desk picks the order up.
- You can reclaim it yourself if the desk took it but didn't settle within the settle window.
- If the rate moves below your floor, or the bank details are invalid, the relayer refunds it.

The signed intent binds the owner, amount, naira floor and a salted hash of the bank details. A relayed signature therefore can't be redirected to someone else's account. Bank details never go on-chain.

**How MUSD is positioned.** MUSD is the asset being cashed out, and Mezo's trove is where the money comes from. Owo also exits its own MUSD through Mezo's protocol redemption (`TroveManager.redeemCollateral`, 0.75% fee) rather than the thin pools, which costs less than selling and supports the peg. The redemption planner uses HintHelpers and SortedTroves. It models a quirk we found: a redemption smaller than the riskiest trove's net debt reverts. So the desk batches (≥ ~1,803 MUSD on testnet today) and adds an interest buffer.

**Business model.** Owo charges a 1% fee per cash-out, shown up front in the quote. It covers the desk's 0.75% redemption exit and gas. The user still gets more naira than selling on Mezo's DEX alone, which loses about 1.25% even at 100 MUSD, before any exchange or P2P costs.

**Integration findings** (documented in the README):
1. `withdrawMUSD` always makes a native call to the recipient for the collateral change, 0 BTC when only MUSD is drawn. A contract recipient therefore needs `receive()`.
2. `HintHelpers.getRedemptionHints` can return a truncated amount that `TroveManager` will reject.

**Target group:**
- **Who:** Nigerians who hold BTC and need naira for everyday spending (rent, school fees, payroll, suppliers) without selling their Bitcoin, and existing Mezo borrowers who want their MUSD to reach a bank account in one step.
- **Device:** mobile-first web app, built for the 375 px screen most users have, and it works on desktop.
- **Experience level:** beginner to intermediate. The user never handles gas, bridges or exchanges.
- **Why it fits Track 2:** it makes MUSD easier to use where users already are, in their bank account. It also directly extends Mezo Borrow.

**Tech stack:**
- **Contract:** Solidity 0.8.24 (evm london) with Foundry. 25 unit and fuzz tests, plus 3 fork tests against real Mezo testnet troves and signatures.
- **Relayer:** Node 24, TypeScript, viem and Hono, with an end-to-end test on an anvil fork of Mezo testnet.
- **Web:** React, Vite and viem; EIP-712 typed-data signing.
- **Off-ramp:** Paycrest Gateway on Base (RSA-encrypted recipient).
- **Hosting:** Railway.
- **Mezo integration:** MUSD (ERC-2612), BorrowerOperationsSignatures, TroveManager, HintHelpers, SortedTroves and PriceFeed.

**Track:** Track 2 (Access and Distribution)

**Chain deployed on:** Mezo (testnet, chain 31611). Payout rail: Paycrest on Base.

**Project status:** Entirely new (built during the hackathon).

**Project readiness:** Testnet deployment.
- **Live app:** https://owo.nerom.site
- **Contract:** OwoDesk [`0x62465d6c87fA5551a379Ca12F135173ed8dAd8CD`](https://explorer.test.mezo.org/address/0x62465d6c87fA5551a379Ca12F135173ed8dAd8CD)
- **Real testnet cash-outs settled on-chain:**
  - [Order #1](https://owo.nerom.site/order/1): borrow route, 50 MUSD to ₦68,597.78.
  - [Order #2](https://owo.nerom.site/order/2): wallet route, 120 MUSD to ₦164,610.81.
- **Payouts:** on testnet the bank transfer is simulated and labelled as such, because test MUSD has no value. The live Paycrest payout path is built and was rehearsed against Paycrest's Base mainnet Gateway on a fork.
- **Try it without real bank details:** choose "Owo Test Bank (testnet demo)" with any 10-digit number. To get test MUSD, open a trove at testnet.mezo.org; for test BTC use faucet.test.mezo.org.

**Future milestones:**
1. **Wave 2 (by Nov 15):** real naira payouts. This covers Paycrest sender verification, live mode on Mezo mainnet with per-user limits, opening a new trove inside the same flow (`openTroveWithSignature`), and Mezo Passport so Bitcoin wallets can sign.
2. **December:** automated float management. The treasury batches MUSD into protocol redemptions and rebalances BTC into Base USDC for payouts, with public reserves and a payout status page.
3. **Q1 2027:** more corridors on the same rail, starting with Ghana (GHS) and Kenya (KES), then Uganda and Tanzania. Also a WhatsApp/Telegram front end.

**Team info:** neromtoobad (solo builder: contracts, relayer, web, design). GitHub: github.com/neromtoobad. X: @neromtoobad.

**Links:**
- **Live:** https://owo.nerom.site
- **GitHub:** https://github.com/neromtoobad/owo
- **Deck:** https://owo.nerom.site/owo-deck.pdf
- **Video:** https://youtu.be/76sDNTn-alk

**Updates in this Wave** (form field): First submission, built from scratch in Wave 1. It includes:
- OwoDesk contract (3 routes, refund guarantees, signed intents) with 28 tests;
- the Paycrest relayer;
- the web app;
- redemption-based treasury exit;
- live on Mezo testnet with real settled cash-outs.

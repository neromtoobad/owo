# AKINDO Wave 2: Owo (submit by Sat Nov 15, 16:00 Lagos / 15:00 UTC)

Final version: testnet v2. Mainnet payouts wait on Paycrest sender KYB, which can't clear before the deadline. Everything below is true today.

## Updates in this Wave (paste; under 3,000 characters)

Wave 2 works through every point in the Wave 1 review (Technical 4 → this wave's focus).

1. Front-running fixed (the High). Anyone could copy a user's WithdrawMUSD signature from a pending relay and submit it to Mezo first. That minted MUSD into the desk with no order and no way out. Now borrowAndCashOut recognises an already-used signature (it must recover to the owner at the nonce just consumed, with the desk as recipient, be used once, and needs that much unassigned MUSD) and opens the order anyway. The desk tracks lockedMusd, so stray MUSD can be returned without ever touching order funds. Proven on a fork of real Mezo, testnet and mainnet, and end to end through the relayer.
2. Verified: OwoDesk v2 is source-verified on the Mezo explorer: https://explorer.test.mezo.org/address/0xC20D8c87c03d4a25f78c02db2c586e72e0b340EA?tab=contract
3. Honest trust model: the app no longer says "only the contract decides". It says settlement rests on the relayer's payout report, which is recorded on-chain with the Paycrest order id. The contract still enforces cancel, reclaim and refunds.
4. Trove risk in the cash-out flow: liquidation price before and after the borrow, how far BTC can fall, Mezo's fixed interest rate and its yearly cost on this borrow, the 0.1% borrowing fee, and a Recovery Mode warning.
5. Redemption health: the treasury reads TroveManager.getTCR and checkRecoveryMode. It refuses below 110% TCR (where Mezo reverts) and holds redemptions in Recovery Mode.
6. Mainnet safety rails:
   - Mainnet never simulates a payout: the relay is refused and stray orders are refunded.
   - A per-wallet daily cap.
   - A Paycrest rate guard. Paycrest briefly quoted ₦683/$ against ₦1,373 on Nov 9; Owo now refuses quotes like that instead of underpaying.
   - A float check before taking an order.
7. Public status page with reserves, payout float, Mezo TCR, limits and every order, linked to the chain: https://owo.nerom.site/status
8. Tests:
   - 30 unit and fuzz tests, including 5 front-run cases and a lockedMusd invariant.
   - 4 fork tests that pass on both Mezo testnet and Mezo mainnet.
   - End to end, the relayer runs both routes, a live front-run, the status page and a treasury redemption.

9. Mainnet-ready: the same 4 fork tests pass on Mezo mainnet. Mainnet never simulates a payout, and a runbook covers the launch (MAINNET.md). Live naira payouts switch on once Paycrest sender KYB clears (1–3 business days).
10. Live on testnet v2 now: two real cash-outs settled on the new contract, 50 MUSD borrowed by signature → ₦68,022.89 and 100 MUSD by permit → ₦136,045.79. They're listed on /status, and the bank step is simulated on testnet.

Links:
- Live: https://owo.nerom.site
- Status: https://owo.nerom.site/status
- Code: https://github.com/neromtoobad/owo (README "Wave 2: what changed", MAINNET.md)
- Video: <wave 2 video>
- Deck: https://owo.nerom.site/owo-deck.pdf

## Milestone · 3rd Wave (paste)

Real naira on mainnet, then scale, Dec – Q1 2027:
- Paycrest sender KYB done → deploy OwoDesk v2 on Mezo mainnet (runbook ready) and pay the first real naira, with every payout on /status.
- Open a new trove inside the same flow (openTroveWithSignature), so a first-time user goes from BTC to naira in one session. Mezo Passport, so Bitcoin wallets can sign.
- Automated float: the treasury batches MUSD into protocol redemptions (with the TCR and Recovery Mode guards) and rebalances into Base USDC, with reserves on the status page.
- New corridors on the same Paycrest rail: Ghana (GHS) and Kenya (KES). A WhatsApp/Telegram front end with loan-health alerts.

## Form fields to change from Wave 1
- **Product type:** Functional
- **About:** replace "What's next" with the Wave 2 list above. Under Submission details, set Readiness to "testnet deployment (v2, verified; mainnet-ready, payouts pending Paycrest KYB)" and give the v2 address 0xC20D8c87c03d4a25f78c02db2c586e72e0b340EA.
- **Chain deployed on:** Mezo testnet (chain 31611).

# Owo: 2-minute pitch (Mezo Buildathon, Wave 1)

Hard limit: **≤ 2:00**. Shape: a ~12 s motion-ad open, then narration in the user's cloned voice over real product footage.
Every claim below is true today. Don't add numbers that aren't in this file.

## 0:00–0:12 · Motion-ad open (music only, kinetic type)
On screen, one beat each:
1. "₿ → ₦"
2. "Your Bitcoin."
3. "In naira."
4. "Two signatures. No gas."
5. The Owo logo.

## 0:12–0:30 · The problem
> You hold Bitcoin, but rent in Lagos is due in naira. Mezo already lets you borrow MUSD against your Bitcoin without selling it. Getting from MUSD to naira is the hard part. You swap on a thin pool, bridge, send to an exchange, sell peer to peer, and lose money at every step. Selling a thousand MUSD on Mezo's own pool loses almost four percent.

On screen: the Owo vs DEX comparison card, and the steps crossed out one by one.

## 0:30–1:05 · The product (real footage of the live app)
> Owo turns that into one flow. Pick an amount. Draw it from your Mezo loan, or use the MUSD in your wallet. Pick any of 174 Nigerian banks, and Owo reads your account name back to you. Then you sign twice. There are no transactions to send and you need no Bitcoin for gas. Your loan mints MUSD straight into a locked order, and the naira goes to your bank.

On screen: Cash out → borrow route → amount → bank picker → name check → sign → the order timeline ticking to Paid. Real order #1 on the Mezo testnet explorer.

## 1:05–1:35 · How it works and why it's safe
> Under the hood, the OwoDesk contract on Mezo calls Mezo's own BorrowerOperations signatures. Your one approval borrows and opens the order together. Our relayer pays out through Paycrest, an open stablecoin-to-bank network, and only after the naira is sent does the desk take your MUSD. If anything fails, your MUSD comes back: cancel before pickup, reclaim after the window, or an automatic refund. Owo exits its MUSD through Mezo redemption at point seven five percent, not the thin pools. That's cheaper for us, and it helps hold the peg.

On screen: the architecture diagram (wallet → OwoDesk → trove; relayer → Paycrest → bank; treasury → TroveManager redemption) and the refund paths.

## 1:35–1:55 · Proof and what's next
> Owo is live on Mezo testnet, with real cash-outs settled on chain. On testnet the bank transfer is simulated, while the Paycrest payout itself is built and rehearsed against Base mainnet. Twenty-eight contract tests run against real Mezo loans. Next: real naira on mainnet, opening a loan inside the same flow, Bitcoin wallets through Mezo Passport, then Ghana and Kenya.

On screen: test output, the live URL, and roadmap chips.

## 1:55–2:00 · Close
> Owo. Your Bitcoin, in naira.

On screen: logo, owo.nerom.site, github.com/neromtoobad/owo.

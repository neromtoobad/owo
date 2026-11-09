# Owo on Mezo mainnet: launch runbook

Mainnet never simulates a payout. Until live payouts are switched on (`LIVE=1` and a
Paycrest API key), the app shows "payouts paused", the API refuses to relay, and the
worker refunds any order opened directly on the contract.

## Addresses

| | |
|---|---|
| Relayer / admin / treasury | `0x62F502Cc354046Dc7C78564D4dBeb633A4e263EA` (RELAYER_KEY in `.env`) |
| Base payout wallet | `0xFff2cb75D6fdF58EDD7D10a7Fd885baCBd1731C2` (BASE_KEY) |
| Paycrest Gateway (Base) | `0x30F6A8457F8E42371E204a9c103f2Bd42341dD0F` |
| Mezo MUSD | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` |
| BorrowerOperationsSignatures | `0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a` |

## 1. The owner funds (not Claude)
1. **Mezo gas:** a little BTC on Mezo mainnet to the relayer. Gas is about 0.0015 gwei, so 0.00001 BTC covers the deploy and months of relaying.
2. **Paycrest:** sign up as a *Sender* at app.paycrest.io and complete KYB. Copy the API key.
3. **Base float:** about 10 USDC plus about $1 of ETH to the Base payout wallet.

## 2. Deploy OwoDesk to mainnet
```bash
cd contracts && set -a && . ../.env && set +a
R=0x62F502Cc354046Dc7C78564D4dBeb633A4e263EA
DEPLOYER_KEY=$RELAYER_KEY MUSD=0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186 \
BOS=0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a ADMIN=$R RELAYER=$R TREASURY=$R \
forge script script/Deploy.s.sol --rpc-url https://mezo.drpc.org --broadcast --legacy --slow
```
Write the address, transaction and block to `deployments/mainnet.json`. Then verify the contract and set conservative limits:
```bash
forge verify-contract <desk> src/OwoDesk.sol:OwoDesk --verifier blockscout \
  --verifier-url https://api.explorer.mezo.org/api/ --chain-id 31612 --compiler-version 0.8.24 \
  --num-of-optimizations 500 --evm-version london --constructor-args $(cast abi-encode \
  "constructor(address,address,address,address,address)" 0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186 \
  0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a $R $R $R) --watch
# setLimits(min 1, max 200, day 1,000 MUSD, settle window 6h) while the float is small
cast send <desk> "setLimits(uint256,uint256,uint256,uint256)" $(cast to-wei 1) $(cast to-wei 200) $(cast to-wei 1000) 21600 \
  --private-key $RELAYER_KEY --rpc-url https://mezo.drpc.org --legacy
```

## 3. Run two services
- **Railway `owo`** stays the testnet service (`MEZO_NET=testnet`) and moves to **owo-testnet.nerom.site**.
- **Railway `owo-mainnet`** is new: the same repo and Dockerfile, with a `/data` volume and these variables, added one at a time (never through the Raw Editor):
  - `MEZO_NET=mainnet`
  - `RELAYER_KEY`
  - `BASE_KEY`
  - `PAYCREST_API_KEY`
  - `LIVE=1`
  - `USER_DAY_CAP=200`
  - `DATA_DIR=/data`
  - `PUBLIC_URL=https://owo.nerom.site`
- **owo.nerom.site:** point `edge/vercel.json` at the mainnet service URL and redeploy the Vercel `owo` project. Add a second Vercel project for owo-testnet.nerom.site that rewrites to the testnet service.

## 4. First real cash-out (the owner, from their own wallet)
1. Hold a few MUSD on Mezo mainnet: swap BTC→MUSD in the Mezo app, or borrow from a trove (Mezo's smallest loan is 1,800 MUSD).
2. On owo.nerom.site, take the wallet route, cash out 2 MUSD to your own bank, and sign twice.
3. Watch /status: the order goes Paid, with a Base transaction into Paycrest's Gateway and the Paycrest order id recorded on Mezo.

## Safety rails in code
- No demo payouts on mainnet: the relay is refused and the worker refunds.
- Per-wallet cap of `USER_DAY_CAP` MUSD in any 24h, plus the contract's own per-order and daily caps.
- Paycrest rate guard: refuses a rate under ₦900/$ or more than 12% off the recent median. Paycrest briefly quoted ₦683 against ₦1,373 on Nov 9.
- Float check before taking an order: with too little USDC on Base, the order is refunded.
- Redemption holds when Mezo's TCR is under 110% or the system is in Recovery Mode.

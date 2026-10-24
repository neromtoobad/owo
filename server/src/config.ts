import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Address, Hex } from 'viem';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Load ../.env for local runs; Railway sets real env vars.
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const env = (k: string, d?: string) => process.env[k] ?? d;

export type Net = 'testnet' | 'mainnet';

const NETS = {
  testnet: {
    chainId: 31611,
    name: 'Mezo Testnet',
    rpc: 'https://rpc.test.mezo.org',
    explorer: 'https://explorer.test.mezo.org',
    musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
    borrowerOps: '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5',
    borrowerOpsSignatures: '0xD757e3646AF370b15f32EB557F0F8380Df7D639e',
    troveManager: '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0',
    priceFeed: '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
    hintHelpers: '0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6',
    sortedTroves: '0x722E4D24FD6Ff8b0AC679450F3D91294607268fA',
  },
  mainnet: {
    chainId: 31612,
    name: 'Mezo',
    rpc: 'https://mezo.drpc.org',
    explorer: 'https://explorer.mezo.org',
    musd: '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186',
    borrowerOps: '0x44b1bac67dDA612a41a58AAf779143B181dEe031',
    borrowerOpsSignatures: '0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a',
    troveManager: '0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193',
    priceFeed: '0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88',
    hintHelpers: '0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3',
    sortedTroves: '0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f',
  },
} as const;

const net = (env('MEZO_NET', 'testnet') as Net);
const n = NETS[net];

function deploymentFile(): { desk?: Address; block?: number } {
  const f = join(root, 'deployments', `${net}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}
const deployment = () => deploymentFile().desk;

export const config = {
  root,
  net,
  chainId: n.chainId,
  chainName: n.name,
  rpc: env('MEZO_RPC', n.rpc)!,
  explorer: n.explorer,
  musd: n.musd as Address,
  borrowerOps: n.borrowerOps as Address,
  borrowerOpsSignatures: n.borrowerOpsSignatures as Address,
  troveManager: n.troveManager as Address,
  priceFeed: n.priceFeed as Address,
  hintHelpers: n.hintHelpers as Address,
  sortedTroves: n.sortedTroves as Address,
  // Holds the MUSD the desk settles and redeems it for BTC. Defaults to the relayer key.
  treasuryKey: (env('TREASURY_KEY') ?? env('RELAYER_KEY')) as Hex | undefined,
  desk: (env('DESK') as Address | undefined) ?? deployment(),
  deskBlock: env('DESK') ? 0 : (deploymentFile().block ?? 0),
  relayerKey: env('RELAYER_KEY') as Hex | undefined,
  // Covers the treasury's 0.75% redemption exit and gas.
  feeBps: Number(env('FEE_BPS', '100')),
  // The naira floor a user signs is the quote minus this cushion, so small rate moves don't refund.
  slippageBps: Number(env('SLIPPAGE_BPS', '100')),
  dataDir: env('DATA_DIR', join(root, 'data'))!,
  port: Number(env('PORT', '8787')),
  publicUrl: env('PUBLIC_URL', 'http://localhost:8787')!,

  // Mezo mainnet pools, used only to show what selling MUSD on a DEX would cost today.
  mainnetRpc: env('MEZO_MAINNET_RPC', 'https://mezo.drpc.org')!,
  musdUsdcPool: '0xEd812AEc0Fecc8fD882Ac3eccC43f3aA80A6c356' as Address,
  mainnetMusd: '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186' as Address,
  redemptionFeeBps: 75,

  // Payouts. "demo" simulates the bank transfer; "live" pays through Paycrest on Base.
  live: env('LIVE') === '1',
  // On testnet, live payouts only for these owners (the operator's own wallet), never for strangers' test MUSD.
  liveOwners: (env('LIVE_OWNERS', '') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  paycrestApi: 'https://api.paycrest.io',
  paycrestKey: env('PAYCREST_API_KEY'),
  baseRpc: env('BASE_RPC', 'https://mainnet.base.org')!,
  baseKey: (env('BASE_KEY') ?? env('RELAYER_KEY')) as Hex | undefined,
  baseGateway: '0x30F6A8457F8E42371E204a9c103f2Bd42341dD0F' as Address,
  baseUsdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
};

export function liveFor(owner: string): boolean {
  if (!config.live || !config.paycrestKey) return false;
  if (config.net === 'mainnet') return true;
  return config.liveOwners.includes(owner.toLowerCase());
}

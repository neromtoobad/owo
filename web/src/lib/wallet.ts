import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  parseSignature,
  type Chain,
  type EIP1193Provider,
} from "viem";
import type { Config, Hex } from "./api";

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { isMetaMask?: boolean };
  }
}

export function chainFrom(c: Config): Chain {
  return defineChain({
    id: c.chainId,
    name: c.net === "mainnet" ? "Mezo" : "Mezo Testnet",
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
    rpcUrls: { default: { http: [c.rpc] } },
    blockExplorers: { default: { name: "Mezo Explorer", url: c.explorer } },
    testnet: c.net !== "mainnet",
  });
}

export const provider = () => (typeof window !== "undefined" ? window.ethereum : undefined);

export function walletClient(c: Config) {
  const p = provider();
  if (!p) throw new Error("No wallet found. Open this page in a wallet browser or install MetaMask.");
  return createWalletClient({ chain: chainFrom(c), transport: custom(p) });
}

export function publicClient(c: Config) {
  return createPublicClient({ chain: chainFrom(c), transport: http(c.rpc) });
}

export async function requestAccounts(): Promise<Hex[]> {
  const p = provider();
  if (!p) throw new Error("No wallet found. Open this page in a wallet browser or install MetaMask.");
  return (await p.request({ method: "eth_requestAccounts" })) as Hex[];
}

export async function currentAccounts(): Promise<Hex[]> {
  const p = provider();
  if (!p) return [];
  try {
    return (await p.request({ method: "eth_accounts" })) as Hex[];
  } catch {
    return [];
  }
}

export async function currentChainId(): Promise<number | null> {
  const p = provider();
  if (!p) return null;
  try {
    return Number(await p.request({ method: "eth_chainId" }));
  } catch {
    return null;
  }
}

export async function switchToMezo(c: Config) {
  const p = provider();
  if (!p) throw new Error("No wallet found.");
  const chainId = "0x" + c.chainId.toString(16);
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    const err = e as { code?: number; data?: { originalError?: { code?: number } }; message?: string };
    const code = err.code ?? err.data?.originalError?.code;
    const unknownChain = code === 4902 || code === -32603 || /unrecognized|not been added|unknown chain/i.test(err.message || "");
    if (!unknownChain) throw e;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: c.net === "mainnet" ? "Mezo" : "Mezo Testnet",
          nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
          rpcUrls: [c.rpc],
          blockExplorerUrls: [c.explorer],
        },
      ],
    });
  }
}

export const OWO_DESK_ABI = [
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  { type: "function", name: "reclaim", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "BadStatus", inputs: [] },
  { type: "error", name: "TooEarly", inputs: [] },
  { type: "error", name: "Paused", inputs: [] },
  { type: "error", name: "Reentrancy", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
] as const;

const REVERT_COPY: Record<string, string> = {
  NotOwner: "Only the wallet that opened this cash-out can do that.",
  BadStatus: "This cash-out has already moved on. Refresh to see its latest status.",
  TooEarly: "The settle window hasn't ended yet, so the MUSD can't be reclaimed.",
  Paused: "The Owo desk is paused right now. Try again shortly.",
};

/** Turn wallet / viem / API errors into one short sentence. */
export function friendlyError(e: unknown): string {
  const any = e as { code?: number; name?: string; message?: string; shortMessage?: string };
  if (any?.code === 4001 || any?.name === "UserRejectedRequestError" || /user (rejected|denied)|rejected the request/i.test(any?.message || "")) {
    return "You declined the request in your wallet. Nothing was signed or sent.";
  }
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (rev instanceof ContractFunctionRevertedError) {
      const n = rev.data?.errorName;
      if (n && REVERT_COPY[n]) return REVERT_COPY[n];
      if (n) return `The contract refused this (${n}).`;
    }
    if (/insufficient funds/i.test(e.message)) return "Your wallet needs a little BTC on Mezo to pay gas for this transaction.";
    const rej = e.walk((x) => (x as { code?: number }).code === 4001);
    if (rej) return "You declined the request in your wallet. Nothing was signed or sent.";
    return e.shortMessage || e.message;
  }
  return any?.shortMessage || any?.message || "Something went wrong.";
}

export function splitSig(sig: Hex): { v: number; r: Hex; s: Hex } {
  const p = parseSignature(sig);
  const v = p.v != null ? Number(p.v) : Number(p.yParity) + 27;
  return { v: v < 27 ? v + 27 : v, r: p.r, s: p.s };
}

export function randomSalt(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as Hex;
}

export function isMobile() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function metamaskDeepLink() {
  const { host, pathname, search } = window.location;
  return `https://metamask.app.link/dapp/${host}${pathname}${search}`;
}

export type Hex = `0x${string}`;

export interface Config {
  net: "testnet" | "mainnet";
  chainId: number;
  rpc: string;
  explorer: string;
  desk: Hex;
  musd: Hex;
  borrowerOpsSignatures: Hex;
  relayer: Hex;
  feeBps: number;
  minOrder: string;
  maxOrder: string;
  dayRoom: string;
  settleWindowSec: number;
  mode: "demo" | "live";
  paycrestRate: number;
}

export interface Bank {
  name: string;
  code: string;
}

export interface Quote {
  musd: string;
  rate: number;
  feeBps: number;
  feeMusd: string;
  naira: number;
  minNaira: number;
  dex: { musdIn: string; usdOut: number; lossPct: number };
  redeem: { usdOut: number; lossPct: number };
  expiresAt: number;
}

export interface Trove {
  coll: string;
  debt: string;
  icr: number;
  price: number;
  borrowable: string;
  bosNonce: number | string;
}

export interface Account {
  musdBalance: string;
  btcBalance: string;
  permitNonce: number | string;
  deskNonce: number | string;
  trove: Trove | null;
}

export type OrderStatus = "open" | "taken" | "paid" | "refunded";
export type Route = "wallet" | "permit" | "borrow";

export interface PayoutStep {
  key: string;
  label: string;
  at: number | null;
  done: boolean;
  note?: string;
}

export interface Order {
  id: string | number;
  owner: Hex;
  amount: string;
  minNaira: number;
  paidNaira: number | null;
  status: OrderStatus;
  route: Route;
  openedAt: number;
  takenAt: number | null;
  mezoTx?: Hex | null;
  bank: { name: string; last4: string; accountName: string };
  payout: { mode: "demo" | "live"; paycrestOrderId?: string; baseTx?: Hex; steps: PayoutStep[] };
  takeTx?: Hex | null;
  settleTx?: Hex | null;
  refundTx?: Hex | null;
}

export type OrderSummary = Pick<Order, "id" | "owner" | "amount" | "minNaira" | "paidNaira" | "status" | "route" | "openedAt"> &
  Partial<Pick<Order, "bank">>;

export interface Stats {
  orders: number;
  paid: number;
  nairaPaid: number;
  musdIn: string;
}

export interface Intent {
  owner: Hex;
  amount: string;
  minNaira: string;
  recipientHash: Hex;
  deadline: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw new ApiError("Can't reach the Owo service. Check your connection and try again.", 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const e = data && typeof data === "object" && "error" in data ? (data as { error: unknown }).error : null;
    const msg = e ? String(e) : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

const post = <T>(path: string, body: unknown) => req<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  config: () => req<Config>("/config"),
  banks: () => req<Bank[]>("/banks"),
  verify: (institution: string, accountIdentifier: string) =>
    post<{ accountName: string }>("/account/verify", { institution, accountIdentifier }),
  quote: (musd: string, signal?: AbortSignal) => req<Quote>(`/quote?musd=${encodeURIComponent(musd)}`, { signal }),
  recipient: (b: { institution: string; accountIdentifier: string; accountName: string; salt: Hex }) =>
    post<{ recipientHash: Hex }>("/recipients", b),
  account: (address: string) => req<Account>(`/account/${address}`),
  relayPermit: (b: { intent: Intent; intentSig: Hex; permitDeadline: string; v: number; r: Hex; s: Hex }) =>
    post<{ txHash: Hex; orderId: string | number }>("/relay/permit", b),
  relayBorrow: (b: { intent: Intent; intentSig: Hex; borrowSig: Hex; borrowDeadline: string }) =>
    post<{ txHash: Hex; orderId: string | number }>("/relay/borrow", b),
  order: (id: string) => req<Order>(`/orders/${encodeURIComponent(id)}`),
  orders: (owner: string) => req<OrderSummary[]>(`/orders?owner=${owner}`),
  stats: () => req<Stats>("/stats"),
};

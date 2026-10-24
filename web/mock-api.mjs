// DEV MOCK ONLY. A stand-in for the Owo relayer so the web app can be built
// before the real relayer is up. Nothing here touches a chain, a bank or Paycrest.
// Run: node mock-api.mjs   (port 8787, or PORT=...)
// Knobs: MOCK_NO_TROVE=1 (account has no trove), MOCK_MODE=live (pretend live payouts)
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const MODE = process.env.MOCK_MODE === "live" ? "live" : "demo";
const RATE = 1372.4;
const FEE_BPS = 50;
const SLIPPAGE_BPS = 100;
const SETTLE_WINDOW = 6 * 3600;

const config = {
  net: "testnet",
  chainId: 31611,
  rpc: "https://rpc.test.mezo.org",
  explorer: "https://explorer.test.mezo.org",
  desk: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
  musd: "0x118917a40faf1cd7a13db0ef56c86de7973ac503",
  borrowerOpsSignatures: "0xd757e3646af370b15f32eb557f0f8380df7d639e",
  relayer: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  feeBps: FEE_BPS,
  minOrder: "1",
  maxOrder: "2000",
  dayRoom: "8420.5",
  settleWindowSec: SETTLE_WINDOW,
  mode: MODE,
  paycrestRate: RATE,
};

const banks = [
  ["Access Bank", "ABNGNGLA"], ["Citibank Nigeria", "CITINGLA"], ["Ecobank Nigeria", "ECOCNGLA"],
  ["Fidelity Bank", "FIDTNGLA"], ["First Bank of Nigeria", "FBNINGLA"], ["First City Monument Bank", "FCMBNGLA"],
  ["Globus Bank", "GLOBNGLA"], ["Guaranty Trust Bank", "GTBINGLA"], ["Heritage Bank", "HBCLNGLA"],
  ["Jaiz Bank", "JAIZNGLA"], ["Keystone Bank", "PLNINGLA"], ["Kuda Microfinance Bank", "KUDANGPC"],
  ["Moniepoint Microfinance Bank", "MONINGPC"], ["OPay", "OPAYNGPC"], ["PalmPay", "PALMNGPC"],
  ["Polaris Bank", "PRDTNGLA"], ["Providus Bank", "PROVNGLA"], ["Stanbic IBTC Bank", "SBICNGLA"],
  ["Standard Chartered Bank", "SCBLNGLA"], ["Sterling Bank", "NAMENGLA"], ["Union Bank of Nigeria", "UBNINGLA"],
  ["United Bank for Africa", "UNAFNGLA"], ["Unity Bank", "ICITNGLA"], ["Wema Bank", "WEMANGLA"],
  ["Zenith Bank", "ZEIBNGLA"],
].map(([name, code]) => ({ name, code }));

const names = ["ADEBAYO OLUWASEUN KAYODE", "CHIOMA NGOZI EZE", "IBRAHIM MUSA BELLO", "OLUWATOYIN GRACE ADEYEMI", "EMEKA JOHN OKAFOR"];

const recipients = new Map(); // hash -> { institution, accountIdentifier, accountName }
const orders = new Map(); // id -> order
let nextId = 41;
const nonces = new Map(); // owner -> { desk, permit, bos }

function nonceOf(owner) {
  const k = owner.toLowerCase();
  if (!nonces.has(k)) nonces.set(k, { desk: 0, permit: 0, bos: 0 });
  return nonces.get(k);
}

function quote(musd) {
  const fee = (musd * FEE_BPS) / 10_000;
  const naira = (musd - fee) * RATE;
  const minNaira = Math.floor(naira * (1 - SLIPPAGE_BPS / 10_000));
  const dexLoss = musd < 100 ? 1.1 : musd < 500 ? 2.3 : musd < 1000 ? 3.4 : 4.5;
  return {
    musd: String(musd),
    rate: RATE,
    feeBps: FEE_BPS,
    feeMusd: fee.toFixed(4),
    naira: Math.round(naira * 100) / 100,
    minNaira,
    dex: { musdIn: String(musd), usdOut: +(musd * (1 - dexLoss / 100)).toFixed(4), lossPct: dexLoss },
    redeem: { usdOut: +(musd * 0.9925).toFixed(4), lossPct: 0.75 },
    expiresAt: Date.now() + 60_000,
  };
}

const fakeHash = () => "0x" + randomBytes(32).toString("hex");

function makeOrder({ owner, amountWei, minNairaKobo, recipientHash, route }) {
  const id = String(nextId++);
  const amount = (Number(BigInt(amountWei) / 10n ** 12n) / 1e6).toString();
  const r = recipients.get(recipientHash) || { institution: "GTBINGLA", accountIdentifier: "0123456789", accountName: names[0] };
  const bank = banks.find((b) => b.code === r.institution);
  const o = {
    id, owner, amount, minNaira: Number(minNairaKobo) / 100, paidNaira: null, status: "open", route,
    openedAt: Date.now(), takenAt: null, mezoTx: fakeHash(),
    bank: { name: bank ? bank.name : r.institution, last4: r.accountIdentifier.slice(-4), accountName: r.accountName },
    payout: { mode: MODE, steps: [] },
  };
  orders.set(id, o);
  return o;
}

// Advance a mock order through its lifecycle by elapsed time.
function tick(o) {
  if (o.status === "refunded" || o.cancelled) return o;
  const t = Date.now() - o.openedAt;
  const s = (key, label, at, note) => ({ key, label, at, done: at != null && at <= Date.now(), note });
  if (t > 5_000 && !o.takenAt) { o.takenAt = o.openedAt + 5_000; o.status = "taken"; }
  if (t > 14_000 && o.status !== "paid") {
    o.status = "paid";
    o.paidNaira = Math.round(o.minNaira * 1.0102);
    o.settleTx = fakeHash();
    if (MODE === "live") { o.payout.paycrestOrderId = "pc_" + randomBytes(6).toString("hex"); o.payout.baseTx = fakeHash(); }
  }
  const at = (ms) => (t > ms ? o.openedAt + ms : null);
  o.payout.steps = [
    s("locked", "MUSD locked on Mezo", o.openedAt),
    s("taken", "Picked up by the Owo desk", at(5_000)),
    s("sent", MODE === "demo" ? "Naira transfer sent (simulated)" : "Naira sent via Paycrest", at(9_000), MODE === "demo" ? "Demo mode: no real bank transfer" : undefined),
    s("paid", "Paid into your bank", at(14_000)),
  ];
  return o;
}

function summary(o) {
  tick(o);
  const { id, owner, amount, minNaira, paidNaira, status, route, openedAt, bank } = o;
  return { id, owner, amount, minNaira, paidNaira, status, route, openedAt, bank };
}

function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let s = "";
  for await (const c of req) s += c;
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (req.method === "GET" && p === "/api/config") return send(res, 200, config);
    if (req.method === "GET" && p === "/api/banks") return send(res, 200, banks);
    if (req.method === "GET" && p === "/api/stats") {
      const all = [...orders.values()].map(tick);
      const paid = all.filter((o) => o.status === "paid");
      return send(res, 200, {
        orders: 128 + all.length,
        paid: 121 + paid.length,
        nairaPaid: 18_402_350 + paid.reduce((a, o) => a + (o.paidNaira || 0), 0),
        musdIn: (13_590.25 + all.reduce((a, o) => a + Number(o.amount), 0)).toFixed(2),
      });
    }
    if (req.method === "GET" && p === "/api/quote") {
      const m = Number(url.searchParams.get("musd"));
      if (!(m > 0)) return send(res, 400, { error: "musd must be a positive number" });
      await sleep(180);
      return send(res, 200, quote(m));
    }
    if (req.method === "POST" && p === "/api/account/verify") {
      const b = await body(req);
      await sleep(700);
      if (!/^\d{10}$/.test(b.accountIdentifier || "")) return send(res, 400, { error: "Account number must be 10 digits" });
      if (b.accountIdentifier === "0000000000") return send(res, 404, { error: "Could not resolve this account. Check the number and bank." });
      const n = names[Number(b.accountIdentifier.slice(-1)) % names.length];
      return send(res, 200, { accountName: n });
    }
    if (req.method === "POST" && p === "/api/recipients") {
      const b = await body(req);
      const recipientHash = "0x" + createHash("sha256").update(JSON.stringify(b)).digest("hex");
      recipients.set(recipientHash, b);
      return send(res, 200, { recipientHash });
    }
    let m;
    if (req.method === "GET" && (m = p.match(/^\/api\/account\/(0x[0-9a-fA-F]{40})$/))) {
      const n = nonceOf(m[1]);
      return send(res, 200, {
        musdBalance: "312.75",
        btcBalance: "0",
        permitNonce: n.permit,
        deskNonce: n.desk,
        trove: process.env.MOCK_NO_TROVE ? null : {
          coll: "0.05", debt: "2150", icr: 223.26, price: 96000, borrowable: "1050", bosNonce: n.bos,
        },
      });
    }
    if (req.method === "POST" && (p === "/api/relay/permit" || p === "/api/relay/borrow")) {
      const b = await body(req);
      const i = b.intent || {};
      if (!i.owner || !i.amount || !i.recipientHash || !b.intentSig) return send(res, 400, { error: "Missing intent fields" });
      if (Number(i.deadline) * 1000 < Date.now()) return send(res, 400, { error: "Intent expired, sign again" });
      await sleep(1200);
      const n = nonceOf(i.owner);
      n.desk++;
      if (p.endsWith("permit")) n.permit++; else n.bos++;
      const o = makeOrder({ owner: i.owner, amountWei: i.amount, minNairaKobo: i.minNaira, recipientHash: i.recipientHash, route: p.endsWith("permit") ? "permit" : "borrow" });
      return send(res, 200, { txHash: o.mezoTx, orderId: o.id });
    }
    if (req.method === "GET" && p === "/api/orders") {
      const owner = (url.searchParams.get("owner") || "").toLowerCase();
      const list = [...orders.values()].filter((o) => o.owner.toLowerCase() === owner).sort((a, b) => b.openedAt - a.openedAt).map(summary);
      return send(res, 200, list);
    }
    if (req.method === "GET" && (m = p.match(/^\/api\/orders\/(\w+)$/))) {
      const o = orders.get(m[1]);
      if (!o) return send(res, 404, { error: "Order not found" });
      return send(res, 200, tick(o));
    }
    send(res, 404, { error: "Not found (mock)" });
  } catch (e) {
    send(res, 500, { error: String(e?.message || e) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`[owo mock api] DEV MOCK listening on http://127.0.0.1:${PORT} (mode=${MODE})`));

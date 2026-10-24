import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseUnits } from "viem";
import { api, type Account, type Bank, type Hex, type Intent, type Quote } from "../lib/api";
import { rememberOrder, useApp } from "../lib/app";
import { useNow, useQuote } from "../lib/hooks";
import { btc, cleanAmount, duration, musd, naira, rate, short, usd } from "../lib/format";
import { navigate } from "../lib/router";
import { friendlyError, isMobile, metamaskDeepLink, randomSalt, splitSig, walletClient } from "../lib/wallet";
import { BankMark, BankPicker } from "../components/BankPicker";
import { Loading, Notice } from "../components/chrome";
import { ArrowLeft, ArrowRight, Bitcoin, Check, External, Pen, Shield, Spinner, Wallet } from "../components/icons";

type RouteKind = "borrow" | "wallet";
const STEPS = ["Wallet", "Amount", "Bank", "Review"];
const MIN_ICR = 150;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="stepper" aria-label="Cash-out progress">
      {STEPS.map((s, i) => (
        <li key={s} className={i < step ? "done" : i === step ? "current" : ""} aria-current={i === step ? "step" : undefined}>
          <span className="stepper-dot">{i < step ? <Check size={14} /> : i + 1}</span>
          <span className="stepper-label">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ wallet */

function WalletStep({ onDone }: { onDone: () => void }) {
  const { config, address, onMezo, hasWallet, connect, switchChain, busy, walletError, clearWalletError } = useApp();
  useEffect(() => {
    if (address && onMezo) onDone();
  }, [address, onMezo, onDone]);

  if (!hasWallet) {
    return (
      <div className="panel">
        <h2 className="h3">Open Owo in a wallet</h2>
        <p className="muted">
          Owo works with any EVM browser wallet, such as MetaMask. You'll sign with it, but you won't send a transaction or pay gas.
        </p>
        {isMobile() ? (
          <a className="btn btn-primary btn-block btn-lg" href={metamaskDeepLink()}>
            Open in MetaMask <ArrowRight size={18} />
          </a>
        ) : (
          <a className="btn btn-primary btn-block btn-lg" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            Get MetaMask <External />
          </a>
        )}
        <p className="tiny muted center" style={{ marginTop: 12 }}>
          Already have one? Reload this page after installing.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2 className="h3">{address ? "Switch to Mezo" : "Connect your wallet"}</h2>
      <p className="muted">
        {address
          ? `You're connected as ${short(address)}. Owo runs on ${config?.net === "mainnet" ? "Mezo" : "Mezo Testnet"}; your wallet will ask to add or switch to it.`
          : "Use the wallet that holds your MUSD or your Mezo trove. Connecting only shares your address."}
      </p>
      {walletError && <Notice onClose={clearWalletError}>{walletError}</Notice>}
      {!address ? (
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={connect} disabled={busy}>
          {busy ? <Spinner /> : <Wallet size={18} />} Connect wallet
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={switchChain} disabled={busy || !config}>
          {busy ? <Spinner /> : null} Switch to {config?.net === "mainnet" ? "Mezo" : "Mezo Testnet"}
        </button>
      )}
      <ul className="checklist tiny muted">
        <li><Check size={14} /> No transaction to send</li>
        <li><Check size={14} /> No BTC needed for gas</li>
        <li><Check size={14} /> Cancel any time before pickup</li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ amount */

function IcrMeter({ now, after }: { now: number; after: number | null }) {
  const lo = 110;
  const hi = 330;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const tone = (v: number) => (v < MIN_ICR ? "bad" : v < 180 ? "warn" : "ok");
  return (
    <div className="icr">
      <div className="icr-track">
        <span className="icr-zone" style={{ left: 0, width: pos(MIN_ICR) }} />
        <span className="icr-tick" style={{ left: pos(MIN_ICR) }}>
          <em>150%</em>
        </span>
        <span className={`icr-mark now ${tone(now)}`} style={{ left: pos(now) }} title={`Now ${now.toFixed(0)}%`} />
        {after != null && <span className={`icr-mark after ${tone(after)}`} style={{ left: pos(after) }} title={`After ${after.toFixed(0)}%`} />}
      </div>
      <div className="icr-legend tiny">
        <span>
          <i className="sw now" /> Now <strong>{now.toFixed(0)}%</strong>
        </span>
        {after != null && (
          <span>
            <i className={`sw after ${tone(after)}`} /> After <strong className={after < MIN_ICR ? "err-text" : ""}>{after.toFixed(0)}%</strong>
          </span>
        )}
      </div>
    </div>
  );
}

function NoTrove() {
  return (
    <div className="helper">
      <Bitcoin size={22} />
      <div>
        <strong>No Mezo trove on this wallet yet</strong>
        <p className="small muted">
          A trove lets you borrow MUSD against BTC. On testnet: get free test BTC from the faucet, open a trove on Mezo, then come back.
        </p>
        <div className="helper-links">
          <a href="https://faucet.test.mezo.org" target="_blank" rel="noreferrer">
            Testnet faucet <External />
          </a>
          <a href="https://testnet.mezo.org" target="_blank" rel="noreferrer">
            Open a trove on Mezo <External />
          </a>
        </div>
      </div>
    </div>
  );
}

function QuoteLines({ quote, loading }: { quote: Quote | null; loading: boolean }) {
  if (!quote) return null;
  return (
    <dl className="lines">
      <div>
        <dt>Owo fee ({(quote.feeBps / 100).toFixed(2)}%)</dt>
        <dd>{musd(quote.feeMusd)} MUSD</dd>
      </div>
      <div>
        <dt>Rate (Paycrest)</dt>
        <dd>1 USD = {rate(quote.rate)}</dd>
      </div>
      <div className="line-strong">
        <dt>You'll get at least</dt>
        <dd className={loading ? "dim" : ""}>{naira(quote.minNaira)}</dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------------ main */

export default function CashOut() {
  const app = useApp();
  const { config, address, onMezo } = app;
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);
  const [accountErr, setAccountErr] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteKind | null>(null);
  const [amount, setAmount] = useState(() => cleanAmount(new URLSearchParams(window.location.search).get("amount") || ""));
  const { quote, loading: qLoading, error: qError, refresh } = useQuote(amount);

  // bank
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksErr, setBanksErr] = useState<string | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [acct, setAcct] = useState("");
  const [verify, setVerify] = useState<{ s: "idle" | "loading" | "ok" | "err"; name?: string; err?: string }>({ s: "idle" });
  const [recipientHash, setRecipientHash] = useState<Hex | null>(null);
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [bankErr, setBankErr] = useState<string | null>(null);

  // sign
  const [phase, setPhase] = useState<null | "prep" | "intent" | "auth" | "relay">(null);
  const [signErr, setSignErr] = useState<string | null>(null);

  const goWallet = useCallback(() => setStep((s) => (s === 0 ? 1 : s)), []);

  useEffect(() => {
    if (window.scrollY > 80) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // drop back to the wallet step if the wallet disconnects or leaves Mezo mid-flow
  useEffect(() => {
    if (step > 0 && (!address || !onMezo) && !phase) setStep(0);
  }, [address, onMezo, step, phase]);

  const loadAccount = useCallback(async () => {
    if (!address) return null;
    try {
      const a = await api.account(address);
      setAccount(a);
      setAccountErr(null);
      return a;
    } catch (e) {
      setAccountErr(friendlyError(e));
      return null;
    }
  }, [address]);

  useEffect(() => {
    setAccount(null);
    setRoute(null);
    if (address) loadAccount();
  }, [address, loadAccount]);

  useEffect(() => {
    if (!account || route) return;
    if (account.trove) setRoute("borrow");
    else if (Number(account.musdBalance) > 0) setRoute("wallet");
    else setRoute("borrow");
  }, [account, route]);

  useEffect(() => {
    api.banks().then(setBanks).catch((e) => setBanksErr(friendlyError(e)));
  }, []);

  // auto-verify the account number
  useEffect(() => {
    setRecipientHash(null);
    if (!bank || acct.length !== 10) {
      setVerify({ s: "idle" });
      return;
    }
    let alive = true;
    setVerify({ s: "loading" });
    api
      .verify(bank.code, acct)
      .then((r) => alive && setVerify({ s: "ok", name: r.accountName }))
      .catch((e) => alive && setVerify({ s: "err", err: friendlyError(e) }));
    return () => {
      alive = false;
    };
  }, [bank, acct]);

  const n = Number(amount) || 0;
  const trove = account?.trove ?? null;
  const newIcr = useMemo(() => {
    if (!trove || !(n > 0)) return null;
    const coll = Number(trove.coll) * trove.price;
    return (coll / (Number(trove.debt) + n)) * 100;
  }, [trove, n]);

  const amountError = useMemo(() => {
    if (!config || !(n > 0)) return null;
    if (n < Number(config.minOrder)) return `The minimum cash-out is ${musd(config.minOrder)} MUSD.`;
    if (n > Number(config.maxOrder)) return `The maximum per cash-out is ${musd(config.maxOrder)} MUSD.`;
    if (n > Number(config.dayRoom)) return `The desk has ${musd(config.dayRoom)} MUSD of room left today. Try a smaller amount.`;
    if (route === "wallet" && account && n > Number(account.musdBalance)) return `This wallet holds ${musd(account.musdBalance)} MUSD.`;
    if (route === "borrow") {
      if (!trove) return "You need a Mezo trove to borrow against BTC.";
      if (newIcr != null && newIcr < MIN_ICR) return `That would take your collateral ratio to ${newIcr.toFixed(0)}%. Owo keeps you at ${MIN_ICR}% or higher.`;
      if (n > Number(trove.borrowable)) return `You can borrow up to ${musd(trove.borrowable)} MUSD and stay above ${MIN_ICR}%.`;
    }
    return null;
  }, [config, n, route, account, trove, newIcr]);

  const maxAmount = useMemo(() => {
    if (!config || !account) return null;
    const caps = [Number(config.maxOrder), Number(config.dayRoom)];
    if (route === "wallet") caps.push(Number(account.musdBalance));
    if (route === "borrow" && trove) caps.push(Number(trove.borrowable));
    const m = Math.floor(Math.min(...caps) * 100) / 100;
    return m > 0 ? m : null;
  }, [config, account, route, trove]);

  const amountOk = n > 0 && !amountError && !!quote && !qError && !!account && !!route;

  const saveRecipient = async () => {
    if (!bank || verify.s !== "ok" || !verify.name) return;
    setBankErr(null);
    setSavingRecipient(true);
    try {
      const r = await api.recipient({ institution: bank.code, accountIdentifier: acct, accountName: verify.name, salt: randomSalt() });
      setRecipientHash(r.recipientHash);
      setStep(3);
    } catch (e) {
      setBankErr(friendlyError(e));
    } finally {
      setSavingRecipient(false);
    }
  };

  const signAndSend = async () => {
    if (!config || !address || !recipientHash || !route) return;
    setSignErr(null);
    setPhase("prep");
    try {
      if (!onMezo) {
        const ok = await app.switchChain();
        if (!ok) throw new Error("Switch your wallet to Mezo to continue.");
      }
      const fresh = await loadAccount();
      if (!fresh) throw new Error("Couldn't load your account from Mezo. Try again.");
      let q = quote;
      if (!q || q.expiresAt < Date.now() + 15_000) q = await refresh();
      if (Number(q.musd) !== n) q = await refresh();

      const amountWei = parseUnits(amount, 18);
      const minKobo = BigInt(Math.floor(q.minNaira * 100));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const wc = walletClient(config);

      setPhase("intent");
      const intentSig = await wc.signTypedData({
        account: address,
        domain: { name: "Owo", version: "1", chainId: config.chainId, verifyingContract: config.desk },
        types: {
          CashOut: [
            { name: "owner", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "minNaira", type: "uint256" },
            { name: "recipientHash", type: "bytes32" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "CashOut",
        message: { owner: address, amount: amountWei, minNaira: minKobo, recipientHash, nonce: BigInt(fresh.deskNonce), deadline },
      });

      const intent: Intent = {
        owner: address,
        amount: amountWei.toString(),
        minNaira: minKobo.toString(),
        recipientHash,
        deadline: deadline.toString(),
      };

      setPhase("auth");
      let res: { txHash: Hex; orderId: string | number };
      if (route === "borrow") {
        if (!fresh.trove) throw new Error("No Mezo trove found on this wallet.");
        const borrowSig = await wc.signTypedData({
          account: address,
          domain: { name: "BorrowerOperationsSignatures", version: "1", chainId: config.chainId, verifyingContract: config.borrowerOpsSignatures },
          types: {
            WithdrawMUSD: [
              { name: "amount", type: "uint256" },
              { name: "borrower", type: "address" },
              { name: "recipient", type: "address" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "WithdrawMUSD",
          message: { amount: amountWei, borrower: address, recipient: config.desk, nonce: BigInt(fresh.trove.bosNonce), deadline },
        });
        setPhase("relay");
        res = await api.relayBorrow({ intent, intentSig, borrowSig, borrowDeadline: deadline.toString() });
      } else {
        const permitSig = await wc.signTypedData({
          account: address,
          domain: { name: "Mezo USD", version: "1", chainId: config.chainId, verifyingContract: config.musd },
          types: {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "Permit",
          message: { owner: address, spender: config.desk, value: amountWei, nonce: BigInt(fresh.permitNonce), deadline },
        });
        const { v, r, s } = splitSig(permitSig);
        setPhase("relay");
        res = await api.relayPermit({ intent, intentSig, permitDeadline: deadline.toString(), v, r, s });
      }
      rememberOrder(res.orderId);
      navigate(`/order/${res.orderId}?new=1`);
    } catch (e) {
      setSignErr(friendlyError(e));
      setPhase(null);
    }
  };

  if (!config) {
    return (
      <div className="flow-page">
        <div className="wrap-narrow">{app.configError ? <Notice>{app.configError}</Notice> : <Loading label="Connecting to Owo" />}</div>
      </div>
    );
  }

  return (
    <div className="flow-page">
      <div className="wrap-narrow">
        <div className="flow-head">
          {step > 1 && !phase ? (
            <button type="button" className="back" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={18} /> Back
            </button>
          ) : (
            <span />
          )}
          <h1 className="flow-title">Cash out to naira</h1>
          <span />
        </div>
        <Stepper step={step} />

        {step === 0 && <WalletStep onDone={goWallet} />}

        {step === 1 && (
          <AmountStep
            {...{ account, accountErr, route, setRoute, amount, setAmount, quote, qLoading, qError, amountError, amountOk, maxAmount, trove, newIcr }}
            onNext={() => setStep(2)}
            onRetry={loadAccount}
          />
        )}

        {step === 2 && (
          <div className="panel">
            <SummaryChip amount={amount} quote={quote} onEdit={() => setStep(1)} />
            <h2 className="h3">Where should the naira go?</h2>
            {banksErr && <Notice>{banksErr}</Notice>}
            <label className="field-label" htmlFor="bank-btn">Bank</label>
            <BankPicker banks={banks} value={bank} onChange={setBank} loading={!banks.length && !banksErr} />

            <label className="field-label" htmlFor="acct" style={{ marginTop: 18 }}>
              Account number
            </label>
            <div className="input-wrap">
              <input
                id="acct"
                className="input mono"
                inputMode="numeric"
                autoComplete="off"
                placeholder="10-digit NUBAN"
                maxLength={10}
                value={acct}
                onChange={(e) => setAcct(e.target.value.replace(/\D/g, "").slice(0, 10))}
                aria-describedby="acct-status"
              />
              <span className="input-count tiny muted">{acct.length}/10</span>
            </div>
            <div id="acct-status" aria-live="polite">
              {verify.s === "loading" && (
                <div className="resolve resolving">
                  <Spinner size={16} /> Checking account name…
                </div>
              )}
              {verify.s === "ok" && bank && (
                <div className="resolve ok">
                  <BankMark bank={bank} size={36} />
                  <div>
                    <div className="resolve-name">{verify.name}</div>
                    <div className="tiny muted">
                      {bank.name} · {acct}
                    </div>
                  </div>
                  <Check className="resolve-check" />
                </div>
              )}
              {verify.s === "err" && <Notice>{verify.err}</Notice>}
              {verify.s === "idle" && bank && acct.length > 0 && acct.length < 10 && (
                <p className="tiny muted">{10 - acct.length} more digits</p>
              )}
            </div>
            {bankErr && <Notice onClose={() => setBankErr(null)}>{bankErr}</Notice>}
            <button
              type="button"
              className="btn btn-primary btn-block btn-lg"
              disabled={verify.s !== "ok" || savingRecipient}
              onClick={saveRecipient}
            >
              {savingRecipient ? <Spinner /> : null}
              {verify.s === "ok" ? "Yes, pay this account" : "Continue"} {!savingRecipient && <ArrowRight size={18} />}
            </button>
            <p className="tiny muted center" style={{ marginTop: 10 }}>
              Only a salted hash of these details goes on-chain.
            </p>
          </div>
        )}

        {step === 3 && bank && verify.name && route && (
          <ReviewStep
            {...{ amount, quote, route, bank, acct, phase, signErr }}
            accountName={verify.name}
            onSign={signAndSend}
            onDismiss={() => setSignErr(null)}
            onRefresh={refresh}
          />
        )}
      </div>
    </div>
  );
}

function SummaryChip({ amount, quote, onEdit }: { amount: string; quote: Quote | null; onEdit: () => void }) {
  return (
    <div className="summary-chip">
      <div>
        <div className="tiny muted">Cashing out {musd(amount)} MUSD</div>
        <div className="summary-naira">{quote ? naira(quote.naira) : "₦—"}</div>
      </div>
      <button type="button" className="link-btn" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ amount step */

function AmountStep(p: {
  account: Account | null;
  accountErr: string | null;
  route: RouteKind | null;
  setRoute: (r: RouteKind) => void;
  amount: string;
  setAmount: (s: string) => void;
  quote: Quote | null;
  qLoading: boolean;
  qError: string | null;
  amountError: string | null;
  amountOk: boolean;
  maxAmount: number | null;
  trove: Account["trove"];
  newIcr: number | null;
  onNext: () => void;
  onRetry: () => void;
}) {
  const { config } = useApp();
  const { account, route, trove, quote } = p;
  const inputRef = useRef<HTMLInputElement>(null);
  if (!account) {
    return (
      <div className="panel">
        {p.accountErr ? (
          <Notice>
            {p.accountErr}{" "}
            <button type="button" className="link-btn" onClick={p.onRetry}>
              Retry
            </button>
          </Notice>
        ) : (
          <Loading label="Reading your Mezo account" />
        )}
      </div>
    );
  }
  const n = Number(p.amount) || 0;
  return (
    <div className="panel">
      <h2 className="h3">Where's the money coming from?</h2>
      <div className="seg" role="radiogroup" aria-label="Source of MUSD">
        <button type="button" role="radio" aria-checked={route === "borrow"} className={route === "borrow" ? "seg-opt on" : "seg-opt"} onClick={() => p.setRoute("borrow")}>
          <Bitcoin size={20} />
          <span>
            <strong>Borrow against my BTC</strong>
            <small>{trove ? `${musd(trove.borrowable)} MUSD available` : "Needs a Mezo trove"}</small>
          </span>
        </button>
        <button type="button" role="radio" aria-checked={route === "wallet"} className={route === "wallet" ? "seg-opt on" : "seg-opt"} onClick={() => p.setRoute("wallet")}>
          <Wallet size={20} />
          <span>
            <strong>Use MUSD in my wallet</strong>
            <small>{musd(account.musdBalance)} MUSD balance</small>
          </span>
        </button>
      </div>

      {route === "borrow" && !trove && <NoTrove />}

      {route === "borrow" && trove && (
        <div className="trove">
          <div className="trove-grid">
            <div>
              <span className="tiny muted">Collateral</span>
              <strong>{btc(trove.coll)} BTC</strong>
              <span className="tiny muted">{usd(Number(trove.coll) * trove.price)}</span>
            </div>
            <div>
              <span className="tiny muted">Debt</span>
              <strong>{musd(trove.debt)}</strong>
              <span className="tiny muted">{n > 0 ? `→ ${musd(Number(trove.debt) + n)} MUSD` : "MUSD"}</span>
            </div>
            <div>
              <span className="tiny muted">BTC price</span>
              <strong>{usd(trove.price)}</strong>
              <span className="tiny muted">Mezo oracle</span>
            </div>
          </div>
          <IcrMeter now={trove.icr} after={p.newIcr} />
        </div>
      )}

      {(route === "wallet" || trove) && (
        <>
          <label className="field-label" htmlFor="amount">
            {route === "borrow" ? "Borrow and cash out" : "Cash out"}
          </label>
          <div className={p.amountError ? "amount-field invalid" : "amount-field"} onClick={() => inputRef.current?.focus()}>
            <input
              id="amount"
              ref={inputRef}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={p.amount}
              onChange={(e) => p.setAmount(cleanAmount(e.target.value))}
              aria-invalid={!!p.amountError}
              aria-describedby="amount-help naira-preview"
            />
            <span className="unit">MUSD</span>
          </div>
          <div className="amount-meta" id="amount-help">
            <span className="tiny muted">
              Min {musd(config!.minOrder)} · Max {musd(config!.maxOrder)} · Today's room {musd(config!.dayRoom)}
            </span>
            {p.maxAmount != null && (
              <button type="button" className="link-btn tiny" onClick={() => p.setAmount(String(p.maxAmount))}>
                Use max
              </button>
            )}
          </div>
          {p.amountError && <p className="field-err" role="alert">{p.amountError}</p>}

          <div className="preview" id="naira-preview" aria-live="polite">
            <div className="tiny muted">Recipient gets</div>
            <div className={p.qLoading ? "preview-naira dim" : "preview-naira"}>{quote && n > 0 ? naira(quote.naira) : "₦0"}</div>
            {p.qError && <p className="small err-text">{p.qError}</p>}
            {n > 0 && <QuoteLines quote={quote} loading={p.qLoading} />}
          </div>

          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!p.amountOk || p.qLoading} onClick={p.onNext}>
            Continue <ArrowRight size={18} />
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ review */

function ReviewStep(p: {
  amount: string;
  quote: Quote | null;
  route: RouteKind;
  bank: Bank;
  acct: string;
  accountName: string;
  phase: null | "prep" | "intent" | "auth" | "relay";
  signErr: string | null;
  onSign: () => void;
  onDismiss: () => void;
  onRefresh: () => Promise<Quote>;
}) {
  const { quote, phase } = p;
  const now = useNow(1000);
  const left = quote ? Math.max(0, Math.round((quote.expiresAt - now) / 1000)) : 0;
  const authLabel = p.route === "borrow" ? "Mezo borrow authorization" : "MUSD spending permit";
  const order = ["prep", "intent", "auth", "relay"];
  const at = phase ? order.indexOf(phase) : -1;
  const state = (i: number) => (at > i ? "done" : at === i ? "active" : "");

  return (
    <div className="panel">
      <div className="review-hero">
        <div className="tiny muted">{p.accountName.split(" ")[0]} receives at least</div>
        <div className="review-naira">{quote ? naira(quote.minNaira) : "₦—"}</div>
        <div className="small muted">
          Expected {quote ? naira(quote.naira) : "—"} · {left > 0 ? `quote refreshes in ${duration(left)}` : "refreshing quote…"}
        </div>
      </div>

      <dl className="lines lines-review">
        <div>
          <dt>You send</dt>
          <dd>{musd(p.amount)} MUSD</dd>
        </div>
        <div>
          <dt>From</dt>
          <dd>{p.route === "borrow" ? "New borrow against your BTC" : "MUSD in your wallet"}</dd>
        </div>
        {quote && (
          <>
            <div>
              <dt>Owo fee</dt>
              <dd>{musd(quote.feeMusd)} MUSD</dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd>1 USD = {rate(quote.rate)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>To</dt>
          <dd className="to">
            <BankMark bank={p.bank} size={24} />
            <span>
              {p.accountName}
              <small>
                {p.bank.name} •••• {p.acct.slice(-4)}
              </small>
            </span>
          </dd>
        </div>
        <div>
          <dt>Gas</dt>
          <dd className="ok-text">Paid by the Owo relayer</dd>
        </div>
      </dl>

      <div className="sigs">
        <div className="sigs-head">
          <Pen size={18} /> <strong>Two signature prompts, no transaction</strong>
        </div>
        <ol>
          <li className={state(1)}>
            <span className="sig-n">{state(1) === "done" ? <Check size={14} /> : state(1) === "active" ? <Spinner size={14} /> : 1}</span>
            <div>
              <strong>Owo cash-out intent</strong>
              <p>Fixes the amount, your naira minimum and the recipient. The desk can't pay anyone else or pay you less.</p>
            </div>
          </li>
          <li className={state(2)}>
            <span className="sig-n">{state(2) === "done" ? <Check size={14} /> : state(2) === "active" ? <Spinner size={14} /> : 2}</span>
            <div>
              <strong>{authLabel}</strong>
              <p>
                {p.route === "borrow"
                  ? `Lets Mezo draw ${musd(p.amount)} MUSD from your trove straight into the Owo desk contract.`
                  : `Lets the Owo desk contract move exactly ${musd(p.amount)} MUSD from your wallet.`}
              </p>
            </div>
          </li>
          <li className={state(3)}>
            <span className="sig-n">{state(3) === "active" ? <Spinner size={14} /> : <Shield size={14} />}</span>
            <div>
              <strong>Relayer submits on Mezo</strong>
              <p>Both signatures expire in 30 minutes. Until the desk picks the order up, you can cancel.</p>
            </div>
          </li>
        </ol>
      </div>

      {p.signErr && (
        <Notice onClose={p.onDismiss}>
          {p.signErr}
          {/expired|quote/i.test(p.signErr) && (
            <>
              {" "}
              <button type="button" className="link-btn" onClick={() => p.onRefresh()}>
                Refresh quote
              </button>
            </>
          )}
        </Notice>
      )}

      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={p.onSign} disabled={!!phase || !quote}>
        {phase ? (
          <>
            <Spinner />{" "}
            {phase === "prep" ? "Preparing…" : phase === "intent" ? "Check your wallet (1 of 2)" : phase === "auth" ? "Check your wallet (2 of 2)" : "Submitting on Mezo…"}
          </>
        ) : (
          <>
            <Pen size={18} /> Sign and cash out
          </>
        )}
      </button>
    </div>
  );
}

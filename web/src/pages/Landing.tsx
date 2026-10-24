import { useEffect, useState } from "react";
import { api, type Stats } from "../lib/api";
import { useApp } from "../lib/app";
import { useQuote } from "../lib/hooks";
import { cleanAmount, compact, musd, naira, rate } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { CountUp } from "../components/chrome";
import { ArrowRight, Bank, Bitcoin, Chart, Fuel, Pen, Return, Shield } from "../components/icons";

const PRESETS = ["50", "150", "500", "1000"];

function CompareCard() {
  const { config } = useApp();
  const [amount, setAmount] = useState("150");
  const { quote, loading, error } = useQuote(amount, 300);
  const dexNaira = quote ? quote.dex.usdOut * quote.rate : null;
  const extra = quote && dexNaira != null ? quote.naira - dexNaira : null;
  const max = quote && dexNaira != null ? Math.max(quote.naira, dexNaira) : 1;

  return (
    <div className="card compare" aria-labelledby="cmp-title">
      <div className="compare-top">
        <h2 id="cmp-title" className="eyebrow">Live quote</h2>
        {quote && <span className="tiny muted">1 USD = {rate(quote.rate)}</span>}
      </div>

      <label className="field-label" htmlFor="cmp-amount">You cash out</label>
      <div className="amount-field amount-field-sm">
        <input
          id="cmp-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(cleanAmount(e.target.value))}
          aria-describedby="cmp-result"
        />
        <span className="unit">MUSD</span>
      </div>
      <div className="chips" role="group" aria-label="Preset amounts">
        {PRESETS.map((p) => (
          <button key={p} type="button" className={amount === p ? "chip on" : "chip"} onClick={() => setAmount(p)}>
            {Number(p).toLocaleString()}
          </button>
        ))}
      </div>

      <div id="cmp-result" aria-live="polite" className="compare-result">
        <div className="tiny muted">Lands in your bank with Owo</div>
        <div className={loading ? "hero-naira dim" : "hero-naira"}>{quote ? naira(quote.naira) : "₦—"}</div>
        {error && <p className="small err-text">{error}</p>}

        <div className="bars">
          <div className="bar-row">
            <div className="bar-label">
              <span>Owo</span>
              <span className="mono">{quote ? naira(quote.naira) : "—"}</span>
            </div>
            <div className="bar"><span className="fill fill-green" style={{ width: quote ? `${(quote.naira / max) * 100}%` : "0%" }} /></div>
            <div className="tiny muted">{config ? `${(config.feeBps / 100).toFixed(2)}% fee, desk exits via Mezo redemption` : " "}</div>
          </div>
          <div className="bar-row">
            <div className="bar-label">
              <span>Sell on Mezo's DEX pools</span>
              <span className="mono">{dexNaira != null ? naira(dexNaira) : "—"}</span>
            </div>
            <div className="bar"><span className="fill fill-grey" style={{ width: dexNaira != null ? `${(dexNaira / max) * 100}%` : "0%" }} /></div>
            <div className="tiny muted">{quote ? `${quote.dex.lossPct.toFixed(2)}% lost to pool slippage at this size` : " "}</div>
          </div>
        </div>

        {extra != null && extra > 0 && (
          <div className="gain">
            You keep <strong>{naira(extra)}</strong> more with Owo
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block btn-lg"
        onClick={() => navigate(`/cash-out${Number(amount) > 0 ? `?amount=${amount}` : ""}`)}
      >
        Cash out {Number(amount) > 0 ? `${musd(amount)} MUSD` : ""} <ArrowRight size={18} />
      </button>
    </div>
  );
}

function StatsStrip() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.stats().then((s) => alive && setStats(s)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const items = [
    { k: "Naira paid out", v: stats?.nairaPaid ?? 0, f: (n: number) => (n >= 1e6 ? `₦${compact(n)}` : naira(n)) },
    { k: "Cash-outs", v: stats?.orders ?? 0, f: (n: number) => Math.round(n).toLocaleString() },
    { k: "Paid in full", v: stats?.paid ?? 0, f: (n: number) => Math.round(n).toLocaleString() },
    { k: "MUSD cashed out", v: Number(stats?.musdIn ?? 0), f: (n: number) => compact(n) },
  ];
  return (
    <section className="stats" aria-label="Live Owo stats">
      <div className="wrap stats-grid">
        {items.map((i) => (
          <div key={i.k} className="stat">
            <div className="stat-v">{stats ? <CountUp value={i.v} format={i.f} /> : "—"}</div>
            <div className="stat-k">{i.k}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Landing() {
  const { config } = useApp();
  const hours = config ? Math.round(config.settleWindowSec / 3600) : 6;
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow eyebrow-pill">
              <Bitcoin size={15} /> MUSD to naira, on Mezo
            </p>
            <h1 className="display">
              Your Bitcoin, <span className="hl">in naira.</span>
            </h1>
            <p className="lede">
              Borrow MUSD against your BTC on Mezo and get naira in any Nigerian bank account. You sign in your wallet, we send
              the transaction, so you never need BTC for gas.
            </p>
            <div className="hero-cta">
              <Link to="/cash-out" className="btn btn-primary btn-lg">
                Start a cash-out <ArrowRight size={18} />
              </Link>
              <a href="#how" className="btn btn-ghost btn-lg">How it works</a>
            </div>
            <ul className="trust">
              <li><Fuel size={16} /> No BTC for gas</li>
              <li><Shield size={16} /> Refunds enforced on-chain</li>
              <li><Bank size={16} /> Any Nigerian bank</li>
            </ul>
          </div>
          <CompareCard />
        </div>
      </section>

      <StatsStrip />

      <section className="section" id="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2 className="h2">Three steps. No exchange account.</h2>
          <ol className="steps3">
            <li>
              <span className="step-n">1</span>
              <h3>Pick an amount</h3>
              <p>Borrow fresh MUSD against the BTC in your Mezo trove, or use MUSD already in your wallet. We show the naira before you commit.</p>
            </li>
            <li>
              <span className="step-n">2</span>
              <h3>Add your bank</h3>
              <p>Choose your bank and enter your 10-digit account number. We look up the account name so you can confirm it's yours.</p>
            </li>
            <li>
              <span className="step-n">3</span>
              <h3>Sign and receive</h3>
              <p>Approve with your wallet's signature prompts. The relayer submits on Mezo, the desk pays out, and you watch it land.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap">
          <p className="eyebrow">Why Owo</p>
          <h2 className="h2">More naira per dollar, and your MUSD is never stuck.</h2>
          <div className="props">
            <article className="prop">
              <span className="prop-ic"><Pen /></span>
              <h3>Signatures, not transactions</h3>
              <p>Your wallet only signs. The Owo relayer submits on Mezo and pays the gas, so an empty BTC balance doesn't stop you.</p>
            </article>
            <article className="prop">
              <span className="prop-ic"><Chart /></span>
              <h3>A better exit than the pools</h3>
              <p>Selling MUSD in Mezo's thin DEX pools loses 1 to 4.5% depending on size. The desk exits through Mezo redemption at a 0.75% fee instead.</p>
            </article>
            <article className="prop">
              <span className="prop-ic"><Bank /></span>
              <h3>Any Nigerian bank</h3>
              <p>Payouts go through Paycrest to commercial banks and fintechs alike: GTBank, Access, OPay, Moniepoint, Kuda and more.</p>
            </article>
            <article className="prop">
              <span className="prop-ic"><Return /></span>
              <h3>Your MUSD comes back</h3>
              <p>
                Cancel any time before the desk picks your order up. If it's picked up but not paid within {hours} hours, reclaim
                it yourself. The contract enforces both.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap safety">
          <div>
            <p className="eyebrow">If anything goes wrong</p>
            <h2 className="h2">The contract holds your MUSD, not us.</h2>
            <p className="lede-sm">
              Your MUSD sits in the OwoDesk contract on Mezo until the naira is confirmed. Only you can pull it back, and only the
              contract decides when.
            </p>
          </div>
          <ol className="flow">
            <li>
              <strong>Locked</strong>
              <span>MUSD moves into the desk contract with your signed limits: amount, minimum naira, recipient.</span>
              <em>You can cancel and get it all back.</em>
            </li>
            <li>
              <strong>Picked up</strong>
              <span>The desk commits to pay. The naira transfer to your bank starts.</span>
              <em>Not paid within {hours}h? Reclaim it.</em>
            </li>
            <li>
              <strong>Paid</strong>
              <span>The desk settles on-chain with the amount of naira paid, never below your signed minimum.</span>
              <em>Receipt on the Mezo explorer.</em>
            </li>
          </ol>
        </div>
      </section>

      <section className="section section-tight">
        <div className="wrap">
          <div className="newbie">
            <div>
              <h2 className="h3">New to Mezo?</h2>
              <p className="muted">
                To borrow against BTC you need a Mezo trove. On testnet, grab free test BTC, open a trove, then come back.
              </p>
            </div>
            <div className="newbie-links">
              <a className="btn btn-ghost" href="https://faucet.test.mezo.org" target="_blank" rel="noreferrer">1. Get test BTC</a>
              <a className="btn btn-ghost" href="https://testnet.mezo.org" target="_blank" rel="noreferrer">2. Open a trove</a>
              <Link className="btn btn-primary" to="/cash-out">3. Cash out</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}


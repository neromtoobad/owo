import { useEffect, useState } from "react";
import { api, type DeskStatus } from "../lib/api";
import { duration, musd, naira, short, usd, when } from "../lib/format";
import { Link } from "../lib/router";
import { friendlyError } from "../lib/wallet";
import { Loading, Notice, StatusPill } from "../components/chrome";

/** Public ledger of the desk: anyone can check reserves, the payout float and every order. */
export default function Status() {
  const [s, setS] = useState<DeskStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .status()
        .then((x) => alive && (setS(x), setErr(null)))
        .catch((e) => alive && setErr(friendlyError(e)));
    load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (err && !s) return <div className="flow-page"><div className="wrap"><Notice>{err}</Notice></div></div>;
  if (!s) return <div className="flow-page"><div className="wrap"><Loading label="Reading the desk" /></div></div>;

  const addr = (a: string | null) => (a ? <a href={`${s.explorer}/address/${a}`} target="_blank" rel="noreferrer" className="mono">{short(a)}</a> : "—");
  const tx = (h: string | null | undefined, base = s.explorer) => (h ? <a href={`${base}/tx/${h}`} target="_blank" rel="noreferrer" className="mono">{short(h, 6, 4)}</a> : null);
  const modeLabel = s.mode === "live" ? "Live naira payouts" : s.mode === "paused" ? "Payouts paused" : "Demo payouts (testnet)";

  return (
    <div className="flow-page">
      <div className="wrap status-page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Public status</p>
            <h1 className="h2">The desk, in the open</h1>
            <p className="muted">
              Read live from {s.net === "mainnet" ? "Mezo mainnet" : "Mezo testnet"} and Base. Every number links to the chain.
            </p>
          </div>
          <span className={`badge ${s.mode === "live" ? "badge-ok" : "badge-line"}`}>{modeLabel}</span>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <span className="tiny muted">Paid out</span>
            <strong>{naira(s.totals.nairaPaid)}</strong>
            <span className="tiny muted">{s.totals.paid} of {s.totals.orders} cash-outs · {musd(s.totals.musdPaid)} MUSD</span>
          </div>
          <div className="stat-card">
            <span className="tiny muted">Held for open orders</span>
            <strong>{musd(s.lockedMusd)} MUSD</strong>
            <span className="tiny muted">Unassigned: {musd(s.unassignedMusd)} MUSD</span>
          </div>
          <div className="stat-card">
            <span className="tiny muted">Payout float ({s.float?.chain ?? "Base"})</span>
            <strong>{s.float ? `${s.float.usdc.toFixed(2)} USDC` : "—"}</strong>
            <span className="tiny muted">{s.float ? `${s.float.eth.toFixed(5)} ETH for gas` : "Not configured"}</span>
          </div>
          <div className="stat-card">
            <span className="tiny muted">Mezo system ratio</span>
            <strong className={s.mezo?.recoveryMode ? "err-text" : ""}>{s.mezo ? `${s.mezo.tcrPct.toFixed(0)}%` : "—"}</strong>
            <span className="tiny muted">
              {s.mezo ? (s.mezo.recoveryMode ? "Recovery Mode: redemptions held" : `Normal · BTC ${usd(s.mezo.btcPrice)}`) : ""}
            </span>
          </div>
        </div>

        <dl className="kv">
          <div><dt>OwoDesk contract</dt><dd>{addr(s.desk)}</dd></div>
          <div><dt>Relayer (pays Mezo gas)</dt><dd>{addr(s.relayer)} · {Number(s.relayerBtc).toFixed(6)} BTC</dd></div>
          <div><dt>Treasury</dt><dd>{addr(s.treasury)} · {musd(s.treasuryMusd)} MUSD</dd></div>
          {s.float && (
            <div>
              <dt>Payout wallet (Base)</dt>
              <dd><a className="mono" href={`https://basescan.org/address/${s.float.address}`} target="_blank" rel="noreferrer">{short(s.float.address)}</a> → Paycrest Gateway <a className="mono" href={`https://basescan.org/address/${s.float.gateway}`} target="_blank" rel="noreferrer">{short(s.float.gateway)}</a></dd>
            </div>
          )}
          <div>
            <dt>Limits</dt>
            <dd>
              {musd(s.limits.minOrder)}–{musd(s.limits.maxOrder)} MUSD per cash-out · {musd(String(s.limits.userDayCap))} per wallet a day · desk room today {musd(s.limits.dayRoom)} · reclaim after {duration(s.limits.settleWindowSec)}
            </dd>
          </div>
        </dl>

        <p className="small muted">
          Trust model: the contract holds each order's MUSD and enforces cancel and reclaim. Settlement rests on the relayer's report that the
          naira was paid, which is recorded on-chain with the Paycrest order id below.
        </p>

        <h2 className="h3">Cash-outs</h2>
        {s.orders.length === 0 ? (
          <p className="muted">No cash-outs yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>#</th><th>When</th><th>Route</th><th>MUSD</th><th>Naira</th><th>Status</th><th>Mezo</th><th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {s.orders.map((o) => (
                  <tr key={String(o.id)}>
                    <td><Link to={`/order/${o.id}`}>{o.id}</Link></td>
                    <td className="nowrap">{when(o.openedAt)}</td>
                    <td>{o.route}</td>
                    <td className="num">{musd(o.amount)}</td>
                    <td className="num">{o.paidNaira ? naira(o.paidNaira) : "—"}</td>
                    <td><StatusPill status={o.status} /></td>
                    <td>{tx(o.settleTx ?? o.refundTx ?? o.mezoTx)}</td>
                    <td>
                      {o.payout.mode === "live" && o.payout.baseTx ? (
                        <a className="mono" href={`https://basescan.org/tx/${o.payout.baseTx}`} target="_blank" rel="noreferrer">Base ↗</a>
                      ) : o.payout.mode === "demo" ? (
                        <span className="tiny muted">simulated</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted">Updated {when(s.at)}.</p>
      </div>
    </div>
  );
}

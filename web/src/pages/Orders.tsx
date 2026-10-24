import { useEffect, useState } from "react";
import { api, type OrderSummary } from "../lib/api";
import { useApp } from "../lib/app";
import { musd, naira, short, when } from "../lib/format";
import { Link } from "../lib/router";
import { friendlyError } from "../lib/wallet";
import { Loading, Notice, StatusPill } from "../components/chrome";
import { ArrowRight, Wallet } from "../components/icons";

export default function Orders() {
  const { address, connect, hasWallet, busy, walletError } = useApp();
  const [list, setList] = useState<OrderSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    const load = () =>
      api
        .orders(address)
        .then((l) => alive && (setList(l), setErr(null)))
        .catch((e) => alive && setErr(friendlyError(e)));
    setList(null);
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [address]);

  return (
    <div className="flow-page">
      <div className="wrap-narrow">
        <div className="page-head">
          <h1 className="h2">My cash-outs</h1>
          {address && <span className="tiny muted">{short(address)}</span>}
        </div>

        {!address ? (
          <div className="panel center">
            <Wallet size={28} />
            <h2 className="h3">Connect to see your cash-outs</h2>
            <p className="muted">Your history is read from the wallet that signed each cash-out.</p>
            {walletError && <Notice>{walletError}</Notice>}
            {hasWallet ? (
              <button type="button" className="btn btn-primary" onClick={connect} disabled={busy}>
                Connect wallet
              </button>
            ) : (
              <p className="small muted">No browser wallet found.</p>
            )}
          </div>
        ) : err ? (
          <Notice>{err}</Notice>
        ) : !list ? (
          <Loading label="Loading cash-outs" />
        ) : list.length === 0 ? (
          <div className="panel center">
            <h2 className="h3">No cash-outs yet</h2>
            <p className="muted">When you cash out, each one shows up here with live status.</p>
            <Link to="/cash-out" className="btn btn-primary">
              Start a cash-out <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <ul className="order-list">
            {list.map((o) => (
              <li key={String(o.id)}>
                <Link to={`/order/${o.id}`} className="order-row">
                  <div className="order-main">
                    <strong className="order-naira">{naira(o.paidNaira ?? o.minNaira)}</strong>
                    <span className="tiny muted">
                      {o.bank ? `${o.bank.accountName.split(" ")[0]} · ${o.bank.name} •••• ${o.bank.last4}` : `#${o.id}`}
                    </span>
                  </div>
                  <div className="order-side">
                    <StatusPill status={o.status} />
                    <span className="tiny muted">
                      {musd(o.amount)} MUSD · {when(o.openedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api, type Hex, type Order } from "../lib/api";
import { useApp } from "../lib/app";
import { useNow } from "../lib/hooks";
import { duration, musd, naira, short, toMs, when } from "../lib/format";
import { Link } from "../lib/router";
import { friendlyError, OWO_DESK_ABI, publicClient, walletClient } from "../lib/wallet";
import { Loading, Notice, StatusPill } from "../components/chrome";
import { ArrowRight, Check, Clock, Copy, External, Info, Return, Share, Spinner } from "../components/icons";

const FINAL = new Set(["paid", "refunded"]);

function TxLink({ href, hash }: { href: string; hash?: string | null }) {
  if (!hash) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="tx">
      {short(hash, 8, 6)} <External />
    </a>
  );
}

export default function OrderPage({ id }: { id: string }) {
  const { config, address, onMezo, switchChain, connect } = useApp();
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [action, setAction] = useState<null | "cancel" | "reclaim">(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [actionTx, setActionTx] = useState<Hex | null>(null);
  const [copied, setCopied] = useState(false);
  const isNew = new URLSearchParams(window.location.search).get("new") === "1";
  const now = useNow(1000);

  const load = useCallback(async () => {
    try {
      const o = await api.order(id);
      setOrder(o);
      setErr(null);
      return o;
    } catch (e) {
      const st = (e as { status?: number }).status;
      if (st === 404) setNotFound(true);
      else setErr(friendlyError(e));
      return null;
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const o = await load();
      if (!alive) return;
      if (o && FINAL.has(o.status)) return;
      t = setTimeout(loop, 3000);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [load]);

  const runAction = async (kind: "cancel" | "reclaim") => {
    if (!config || !order) return;
    setActionErr(null);
    setAction(kind);
    try {
      let who = address;
      if (!who) who = await connect();
      if (!who) throw new Error("Connect the wallet that opened this cash-out.");
      if (who.toLowerCase() !== order.owner.toLowerCase()) throw new Error(`Switch your wallet to ${short(order.owner)}, the account that opened this cash-out.`);
      if (!onMezo && !(await switchChain())) throw new Error("Switch your wallet to Mezo to continue.");
      const pc = publicClient(config);
      const wc = walletClient(config);
      const { request } = await pc.simulateContract({
        address: config.desk,
        abi: OWO_DESK_ABI,
        functionName: kind,
        args: [BigInt(order.id)],
        account: who,
      });
      const hash = await wc.writeContract({ ...request, account: who });
      setActionTx(hash);
      await pc.waitForTransactionReceipt({ hash });
      await load();
    } catch (e) {
      setActionErr(friendlyError(e));
    } finally {
      setAction(null);
    }
  };

  const share = async () => {
    const url = window.location.origin + `/order/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Owo cash-out", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* dismissed */
    }
  };

  if (notFound) {
    return (
      <div className="flow-page">
        <div className="wrap-narrow">
          <div className="panel center">
            <h1 className="h3">We couldn't find cash-out #{id}</h1>
            <p className="muted">Check the link, or find it under My cash-outs.</p>
            <Link to="/orders" className="btn btn-primary">My cash-outs</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!order || !config) {
    return (
      <div className="flow-page">
        <div className="wrap-narrow">{err ? <Notice>{err}</Notice> : <Loading label="Loading your cash-out" />}</div>
      </div>
    );
  }

  const ex = (h: string) => `${config.explorer}/tx/${h}`;
  const isOwner = !!address && address.toLowerCase() === order.owner.toLowerCase();
  const takenMs = toMs(order.takenAt);
  const reclaimAt = takenMs ? takenMs + config.settleWindowSec * 1000 : null;
  const canReclaim = order.status === "taken" && reclaimAt != null && now > reclaimAt;
  const steps = order.payout?.steps ?? [];
  const firstPending = steps.findIndex((s) => !s.done);
  const paid = order.status === "paid";
  const refunded = order.status === "refunded";

  return (
    <div className="flow-page">
      <div className="wrap-narrow">
        {isNew && !FINAL.has(order.status) && (
          <Notice tone="info">Signed and submitted. Keep this page open or share the link; it updates by itself.</Notice>
        )}

        <div className={`status-card status-${order.status}`}>
          <div className="status-top">
            <span className="tiny muted">Cash-out #{order.id}</span>
            <StatusPill status={order.status} />
          </div>
          <div className="status-amount">
            {paid ? (
              <>
                <div className="tiny muted paid-to"><Check size={14} /> Paid to {order.bank.accountName}</div>
                <div className="status-naira">{naira(order.paidNaira)}</div>
              </>
            ) : refunded ? (
              <>
                <div className="tiny muted">Returned to your wallet</div>
                <div className="status-naira">{musd(order.amount)} MUSD</div>
              </>
            ) : (
              <>
                <div className="tiny muted">On its way to {order.bank.accountName}</div>
                <div className="status-naira">
                  <span className="atleast">at least</span> {naira(order.minNaira)}
                </div>
              </>
            )}
            <div className="small muted">
              {order.bank.name} •••• {order.bank.last4} · {musd(order.amount)} MUSD
            </div>
          </div>
        </div>

        {order.payout?.mode === "demo" && (
          <Notice tone="info">
            Demo payout: every Mezo step here is a real testnet transaction, but the naira bank transfer is simulated.
          </Notice>
        )}

        <div className="panel">
          <h2 className="h4">Progress</h2>
          <ol className="timeline">
            {steps.map((s, i) => {
              const cls = s.done ? "done" : !refunded && i === firstPending ? "current" : "";
              return (
                <li key={s.key} className={cls}>
                  <span className="tl-dot">{s.done ? <Check size={14} /> : cls === "current" ? <span className="pulse" /> : null}</span>
                  <div className="tl-body">
                    <div className="tl-row">
                      <strong>{s.label}</strong>
                      <span className="tiny muted">{s.at && s.done ? when(s.at) : ""}</span>
                    </div>
                    {s.note && <p className="tiny muted">{s.note}</p>}
                    {s.key === "locked" && order.mezoTx && <TxLink href={ex(order.mezoTx)} hash={order.mezoTx} />}
                    {s.key === "taken" && order.takeTx && <TxLink href={ex(order.takeTx)} hash={order.takeTx} />}
                    {s.key === "payout" && order.payout.baseTx && <TxLink href={`https://basescan.org/tx/${order.payout.baseTx}`} hash={order.payout.baseTx} />}
                    {s.key === "settled" && order.settleTx && <TxLink href={ex(order.settleTx)} hash={order.settleTx} />}
                  </div>
                </li>
              );
            })}
            {refunded && (
              <li className="done refund">
                <span className="tl-dot"><Return size={14} /></span>
                <div className="tl-body">
                  <div className="tl-row">
                    <strong>MUSD returned to your wallet</strong>
                  </div>
                  {order.refundTx && <TxLink href={ex(order.refundTx)} hash={order.refundTx} />}
                </div>
              </li>
            )}
          </ol>
        </div>

        {(order.status === "open" || order.status === "taken") && (
          <div className="panel panel-quiet">
            <h2 className="h4">Changed your mind?</h2>
            {order.status === "open" ? (
              <>
                <p className="small muted">
                  The desk hasn't picked this up yet, so you can cancel and get all {musd(order.amount)} MUSD back. Cancelling is a
                  transaction from your own wallet, so it needs a little BTC on Mezo for gas.
                  {config.net === "testnet" && (
                    <>
                      {" "}
                      <a href="https://faucet.test.mezo.org" target="_blank" rel="noreferrer">Get test BTC</a>.
                    </>
                  )}
                </p>
                <button type="button" className="btn btn-danger" onClick={() => runAction("cancel")} disabled={!!action || (!!address && !isOwner)}>
                  {action === "cancel" ? <Spinner /> : <Return size={18} />} Cancel and get my MUSD back
                </button>
              </>
            ) : canReclaim ? (
              <>
                <p className="small muted">
                  The desk picked this up more than {Math.round(config.settleWindowSec / 3600)} hours ago without settling. The contract
                  now lets you take your MUSD back. This needs a little BTC on Mezo for gas.
                </p>
                <button type="button" className="btn btn-danger" onClick={() => runAction("reclaim")} disabled={!!action || (!!address && !isOwner)}>
                  {action === "reclaim" ? <Spinner /> : <Return size={18} />} Reclaim my MUSD
                </button>
              </>
            ) : (
              <p className="small muted row-ic">
                <Clock />
                <span>
                  The desk is paying out now. If it isn't settled
                  {reclaimAt ? ` in ${duration((reclaimAt - now) / 1000)}` : ` within ${Math.round(config.settleWindowSec / 3600)} hours`}, you can
                  reclaim your MUSD from the contract here.
                </span>
              </p>
            )}
            {address && !isOwner && (
              <p className="tiny muted" style={{ marginTop: 8 }}>
                <Info size={13} /> Connected as {short(address)}; only {short(order.owner)} can do this.
              </p>
            )}
            {actionTx && (
              <p className="tiny" style={{ marginTop: 8 }}>
                Transaction: <TxLink href={ex(actionTx)} hash={actionTx} />
              </p>
            )}
            {actionErr && <Notice onClose={() => setActionErr(null)}>{actionErr}</Notice>}
          </div>
        )}

        <div className="panel">
          <h2 className="h4">Details</h2>
          <dl className="lines">
            <div>
              <dt>Amount</dt>
              <dd>{musd(order.amount)} MUSD</dd>
            </div>
            <div>
              <dt>Naira floor you signed</dt>
              <dd>{naira(order.minNaira)}</dd>
            </div>
            {order.paidNaira != null && (
              <div>
                <dt>Naira paid</dt>
                <dd>{naira(order.paidNaira)}</dd>
              </div>
            )}
            <div>
              <dt>Source</dt>
              <dd>{order.route === "borrow" ? "Borrowed against BTC" : "MUSD from wallet"}</dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd>
                {order.bank.accountName}, {order.bank.name} •••• {order.bank.last4}
              </dd>
            </div>
            <div>
              <dt>Opened</dt>
              <dd>{when(order.openedAt)}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>
                <a className="tx" href={`${config.explorer}/address/${order.owner}`} target="_blank" rel="noreferrer">
                  {short(order.owner)} <External />
                </a>
              </dd>
            </div>
            {order.payout?.paycrestOrderId && (
              <div>
                <dt>Paycrest order</dt>
                <dd className="mono small">{order.payout.paycrestOrderId}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="row-actions">
          <button type="button" className="btn btn-ghost" onClick={share}>
            {copied ? <Check size={16} /> : "share" in navigator ? <Share /> : <Copy />} {copied ? "Link copied" : "Share status"}
          </button>
          <Link to="/cash-out" className="btn btn-primary">
            New cash-out <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}

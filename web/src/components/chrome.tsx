import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "../lib/app";
import { Link, usePath } from "../lib/router";
import { short } from "../lib/format";
import { Alert, Close, Info, Spinner, Wallet } from "./icons";

/** Cowrie shell: money in Yorubaland long before the naira. */
export function Cowrie({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <ellipse cx="16" cy="16" rx="11" ry="14" fill="var(--green)" transform="rotate(-28 16 16)" />
      <ellipse cx="16" cy="16" rx="8.2" ry="11.2" fill="var(--green-deep)" transform="rotate(-28 16 16)" />
      <path d="M10.6 23.4c1.6-2.2 2.2-4.2 3.6-6.6 1.4-2.5 3.6-4.6 7.2-8.2" stroke="var(--cream)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <g stroke="var(--cream)" strokeWidth="1.3" strokeLinecap="round" opacity=".85">
        <path d="M11.6 19.6l-1.6-.6M13 16.9l-1.7-.4M14.7 14.4l-1.5-.6M16.7 12.1l-1.4-.8M18.9 10l-1.2-1" />
        <path d="M13.9 22.4l1.1 1.2M15.3 19.7l1.4.9M17 17.1l1.5.7M18.9 14.8l1.5.5M21 12.6l1.5.3" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Owo home">
      <Cowrie />
      <span>owo</span>
    </Link>
  );
}

export function NetBadges() {
  const { config } = useApp();
  if (!config) return null;
  return (
    <div className="badges">
      {config.net === "testnet" && <span className="badge badge-ochre" title="Running on Mezo Testnet with test BTC and test MUSD">Testnet</span>}
      {config.mode === "demo" && (
        <span className="badge badge-line" title="In demo mode the bank transfer is simulated. Everything on Mezo is real.">
          Demo payouts
        </span>
      )}
    </div>
  );
}

export function Header() {
  const { address, connect, hasWallet, busy, config } = useApp();
  const path = usePath();
  return (
    <header className="header">
      <div className="wrap header-row">
        <div className="header-left">
          <Logo />
          <NetBadges />
        </div>
        <nav className="nav" aria-label="Main">
          <Link to="/orders" className={path.startsWith("/orders") ? "nav-link active" : "nav-link"}>
            <span className="nav-long">My cash-outs</span>
            <span className="nav-short">History</span>
          </Link>
          {address ? (
            <span className="addr-chip" title={address}>
              <span className="dot" aria-hidden="true" />
              {short(address, 5, 4)}
            </span>
          ) : hasWallet ? (
            <button type="button" className="btn btn-ghost btn-sm hide-sm" onClick={connect} disabled={busy}>
              <Wallet size={16} /> Connect
            </button>
          ) : null}
          {!path.startsWith("/cash-out") && (
            <Link to="/cash-out" className="btn btn-primary btn-sm">
              Cash out
            </Link>
          )}
        </nav>
      </div>
      {config?.mode === "demo" && (
        <div className="demo-strip">
          <span className="wrap">Demo payouts: the naira bank transfer is simulated.</span>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const { config } = useApp();
  return (
    <footer className="footer">
      <div className="wrap footer-row">
        <div>
          <Logo />
          <p className="muted small" style={{ marginTop: 10, maxWidth: 360 }}>
            Owo turns MUSD, Mezo's Bitcoin-backed dollar, into naira in any Nigerian bank. Built for the Mezo Buildathon.
          </p>
        </div>
        <div className="footer-links small">
          <a href="https://mezo.org" target="_blank" rel="noreferrer">Mezo</a>
          <a href="https://paycrest.io" target="_blank" rel="noreferrer">Paycrest</a>
          {config && (
            <a href={`${config.explorer}/address/${config.desk}`} target="_blank" rel="noreferrer">
              Desk contract
            </a>
          )}
          <a href="https://faucet.test.mezo.org" target="_blank" rel="noreferrer">Testnet faucet</a>
        </div>
      </div>
      {config?.net === "testnet" && (
        <div className="wrap">
          <p className="tiny muted footer-note">
            Testnet build. MUSD and BTC here have no value.
            {config.mode === "demo" ? " Payouts are in demo mode: the naira transfer is simulated, every Mezo step is real." : ""}
          </p>
        </div>
      )}
    </footer>
  );
}

export function Notice({ tone = "error", children, onClose }: { tone?: "error" | "info" | "warn"; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="notice-icon">{tone === "info" ? <Info size={18} /> : <Alert />}</span>
      <div className="notice-body">{children}</div>
      {onClose && (
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Dismiss">
          <Close size={16} />
        </button>
      )}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <Spinner /> <span>{label}…</span>
    </div>
  );
}

/** Live-counting number for stats. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(value);
    const start = performance.now();
    const from = n;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setN(from + (value - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{format(n)}</>;
}

export function StatusPill({ status }: { status: string }) {
  const label: Record<string, string> = { open: "Waiting for pickup", taken: "Paying out", paid: "Paid", refunded: "Refunded" };
  return <span className={`pill pill-${status}`}>{label[status] ?? status}</span>;
}

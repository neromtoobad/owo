import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Bank } from "../lib/api";
import { ChevronDown, Search } from "./icons";

const POPULAR = ["OPay", "Moniepoint", "Guaranty Trust", "Access", "Kuda", "PalmPay", "Zenith", "United Bank for Africa"];

function initials(name: string) {
  const w = name.replace(/\b(bank|of|plc|limited|nigeria|microfinance|mfb)\b/gi, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

/** Deterministic warm tint per bank so the list scans faster. */
function tint(code: string) {
  const palette = ["#E3F0E7", "#FCEFD9", "#E8EEF8", "#F6E6E1", "#ECE8DC", "#E4F1F0"];
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export function BankMark({ bank, size = 32 }: { bank: Bank; size?: number }) {
  return (
    <span className="bank-mark" style={{ width: size, height: size, background: tint(bank.code) }} aria-hidden="true">
      {initials(bank.name)}
    </span>
  );
}

export function BankPicker({
  banks,
  value,
  onChange,
  loading,
}: {
  banks: Bank[];
  value: Bank | null;
  onChange: (b: Bank) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? banks.filter((b) => b.name.toLowerCase().includes(s) || b.code.toLowerCase().includes(s)) : banks;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [banks, q]);

  const popular = useMemo(
    () => POPULAR.map((p) => banks.find((b) => b.name.toLowerCase().includes(p.toLowerCase()))).filter(Boolean) as Bank[],
    [banks],
  );

  useEffect(() => {
    if (open) {
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  const pick = (b: Bank) => {
    onChange(b);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="bankpicker" ref={boxRef}>
      <button
        type="button"
        className="select"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        id="bank-btn"
      >
        {value ? (
          <span className="select-val">
            <BankMark bank={value} size={28} /> {value.name}
          </span>
        ) : (
          <span className="select-ph">{loading ? "Loading banks…" : "Choose your bank"}</span>
        )}
        <ChevronDown />
      </button>

      {!value && !open && popular.length > 0 && (
        <div className="chips chips-wrap" role="group" aria-label="Popular banks">
          {popular.slice(0, 6).map((b) => (
            <button key={b.code} type="button" className="chip" onClick={() => pick(b)}>
              {b.name.replace(/ (Microfinance )?Bank( of Nigeria)?$/i, "").replace("Guaranty Trust", "GTBank")}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="pop" role="dialog" aria-label="Choose your bank">
          <div className="pop-search">
            <Search />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              placeholder="Search banks"
              aria-label="Search banks"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(filtered.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered[active]) pick(filtered[active]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                  document.getElementById("bank-btn")?.focus();
                }
              }}
            />
          </div>
          <ul className="pop-list" role="listbox" id={listId} aria-label="Banks">
            {filtered.length === 0 && <li className="pop-empty">No bank matches “{q}”</li>}
            {filtered.map((b, i) => (
              <li
                key={b.code}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={value?.code === b.code}
                className={i === active ? "pop-item active" : "pop-item"}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(b)}
              >
                <BankMark bank={b} size={28} />
                <span>{b.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

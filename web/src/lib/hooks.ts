import { useEffect, useRef, useState } from "react";
import { api, type Quote } from "./api";
import { friendlyError } from "./wallet";

/** Debounced live quote that refreshes itself when it expires. */
export function useQuote(amount: string, delay = 380) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const n = Number(amount);
    if (!amount || !(n > 0)) {
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      api
        .quote(amount, c.signal)
        .then((q) => {
          if (c.signal.aborted) return;
          setQuote(q);
          setError(null);
        })
        .catch((e) => {
          if (c.signal.aborted || (e as Error).name === "AbortError") return;
          setError(friendlyError(e));
        })
        .finally(() => !c.signal.aborted && setLoading(false));
    }, delay);
    return () => clearTimeout(t);
  }, [amount, delay, tick]);

  // refresh on expiry
  useEffect(() => {
    if (!quote) return;
    const ms = quote.expiresAt - Date.now();
    const t = setTimeout(() => setTick((x) => x + 1), Math.max(1000, ms));
    return () => clearTimeout(t);
  }, [quote]);

  const refresh = async () => {
    const q = await api.quote(amount);
    setQuote(q);
    return q;
  };

  return { quote, loading, error, refresh };
}

export function useNow(every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

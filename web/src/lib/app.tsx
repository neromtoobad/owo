import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Config, type Hex } from "./api";
import { currentAccounts, currentChainId, friendlyError, provider, requestAccounts, switchToMezo } from "./wallet";

interface AppState {
  config: Config | null;
  configError: string | null;
  address: Hex | null;
  chainId: number | null;
  onMezo: boolean;
  hasWallet: boolean;
  busy: boolean;
  walletError: string | null;
  connect: () => Promise<Hex | null>;
  switchChain: () => Promise<boolean>;
  clearWalletError: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [address, setAddress] = useState<Hex | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(!!provider());

  useEffect(() => {
    let alive = true;
    const load = (attempt = 0) =>
      api
        .config()
        .then((c) => alive && (setConfig(c), setConfigError(null)))
        .catch((e) => {
          if (!alive) return;
          setConfigError(friendlyError(e));
          if (attempt < 20) setTimeout(() => load(attempt + 1), 3000);
        });
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // Some wallets inject late (mobile in-app browsers) and announce it with this event.
    const t = setTimeout(() => setHasWallet(!!provider()), 600);
    const onInit = () => setHasWallet(!!provider());
    window.addEventListener("ethereum#initialized", onInit, { once: true });
    const p = provider();
    if (!p)
      return () => {
        clearTimeout(t);
        window.removeEventListener("ethereum#initialized", onInit);
      };
    currentAccounts().then((a) => setAddress(a[0] ?? null));
    currentChainId().then(setChainId);
    const onAcc = (a: unknown) => setAddress(((a as Hex[])[0] ?? null) as Hex | null);
    const onChain = (c: unknown) => setChainId(Number(c));
    p.on?.("accountsChanged", onAcc);
    p.on?.("chainChanged", onChain);
    return () => {
      clearTimeout(t);
      p.removeListener?.("accountsChanged", onAcc);
      p.removeListener?.("chainChanged", onChain);
    };
  }, [hasWallet]);

  const connect = useCallback(async () => {
    setWalletError(null);
    setBusy(true);
    try {
      const a = await requestAccounts();
      setAddress(a[0] ?? null);
      setChainId(await currentChainId());
      return a[0] ?? null;
    } catch (e) {
      setWalletError(friendlyError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const switchChain = useCallback(async () => {
    if (!config) return false;
    setWalletError(null);
    setBusy(true);
    try {
      await switchToMezo(config);
      const id = await currentChainId();
      setChainId(id);
      return id === config.chainId;
    } catch (e) {
      setWalletError(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [config]);

  const onMezo = !!config && chainId === config.chainId;

  return (
    <Ctx.Provider
      value={{
        config,
        configError,
        address,
        chainId,
        onMezo,
        hasWallet,
        busy,
        walletError,
        connect,
        switchChain,
        clearWalletError: () => setWalletError(null),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

const KEY = "owo:orders";
export function rememberOrder(id: string | number) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(KEY) || "[]");
    const s = String(id);
    localStorage.setItem(KEY, JSON.stringify([s, ...list.filter((x) => x !== s)].slice(0, 30)));
  } catch {
    /* storage off */
  }
}

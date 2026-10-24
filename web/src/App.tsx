import { useEffect } from "react";
import { AppProvider, useApp } from "./lib/app";
import { Link, usePath } from "./lib/router";
import { Footer, Header, Notice } from "./components/chrome";
import Landing from "./pages/Landing";
import CashOut from "./pages/CashOut";
import OrderPage from "./pages/Order";
import Orders from "./pages/Orders";

function Routes() {
  const path = usePath().replace(/\/+$/, "") || "/";
  const { configError, config } = useApp();
  const m = path.match(/^\/order\/([^/]+)$/);

  useEffect(() => {
    const t: Record<string, string> = { "/": "Owo · Your Bitcoin, in naira", "/cash-out": "Cash out · Owo", "/orders": "My cash-outs · Owo" };
    document.title = m ? `Cash-out #${m[1]} · Owo` : t[path] ?? "Owo";
  }, [path, m]);

  let page;
  if (path === "/") page = <Landing />;
  else if (path === "/cash-out") page = <CashOut />;
  else if (path === "/orders") page = <Orders />;
  else if (m) page = <OrderPage id={decodeURIComponent(m[1])} key={m[1]} />;
  else
    page = (
      <div className="flow-page">
        <div className="wrap-narrow panel center">
          <h1 className="h3">This page doesn't exist</h1>
          <Link to="/" className="btn btn-primary">Go home</Link>
        </div>
      </div>
    );

  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Header />
      {configError && !config && (
        <div className="wrap" style={{ paddingTop: 12 }}>
          <Notice>{configError} Retrying…</Notice>
        </div>
      )}
      <main id="main">{page}</main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Routes />
    </AppProvider>
  );
}

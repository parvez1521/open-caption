/**
 * Load the Cashfree JS SDK in the browser — the same script the billing
 * page loads for plan checkout. Shared here so the Export modal's ₹69
 * watermark-removal buy button opens the same hosted checkout without
 * duplicating the loader.
 */

export type CashfreeFactory = (opts: { mode: string }) => {
  checkout: (opts: { paymentSessionId: string; returnTarget?: string }) => Promise<unknown>;
  /** Subscription hosted checkout (Cashfree JS SDK v3). Absent on an old cached SDK. */
  subscriptionsCheckout?: (opts: { subsSessionId: string; redirectTarget?: string }) => Promise<unknown>;
};

declare global {
  interface Window {
    Cashfree?: CashfreeFactory;
  }
}

export function loadCashfreeSdk(): Promise<CashfreeFactory> {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout needs a browser."));
  if (window.Cashfree) return Promise.resolve(window.Cashfree);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = () => (window.Cashfree ? resolve(window.Cashfree) : reject(new Error("Cashfree SDK did not initialise.")));
    script.onerror = () => reject(new Error("Could not load the Cashfree checkout. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

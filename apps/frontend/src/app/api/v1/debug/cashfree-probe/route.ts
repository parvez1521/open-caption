import { NextResponse } from "next/server";

/**
 * TEMPORARY DIAGNOSTIC ONLY — never merge to main.
 *
 * Proves whether Vercel's serverless network can reach Cashfree's hosts.
 * Posts to /pg/orders with DUMMY credentials ("TEST"), so any HTTP
 * response — a 401 for the dummy creds means "reachable" — proves the
 * network path works, while a thrown "fetch failed" proves it does not.
 * No real credentials are used, no order is created, nothing is charged.
 *
 * GET /api/v1/debug/cashfree-probe?host=sandbox (default) | production
 */
const HOSTS = {
  sandbox: "https://sandbox.cashfree.com",
  production: "https://api.cashfree.com",
} as const;

export async function GET(req: Request) {
  const host = new URL(req.url).searchParams.get("host") === "production" ? "production" : "sandbox";
  const base = HOSTS[host];
  const started = Date.now();
  try {
    const res = await fetch(`${base}/pg/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2023-08-01",
        "x-client-id": "TEST",
        "x-client-secret": "TEST",
      },
      body: JSON.stringify({ order_id: "probe", order_amount: 1, order_currency: "INR" }),
    });
    const text = await res.text().catch(() => "");
    return NextResponse.json({
      host,
      url: `${base}/pg/orders`,
      reachable: true,
      status: res.status,
      ms: Date.now() - started,
      body: text.slice(0, 200),
    });
  } catch (e) {
    return NextResponse.json({
      host,
      url: `${base}/pg/orders`,
      reachable: false,
      status: null,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

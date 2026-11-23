/**
 * Maintenance mode (production-pages audit): config-driven only.
 *
 * Set MAINTENANCE_MODE=true in the deployment environment to show the
 * holding page on every page route. Default off. The value is read at
 * request time in the server root layout, so flipping it takes effect on
 * the next deployment of that environment — there is no instant toggle
 * and no hardcoded "under maintenance" text anywhere in the app.
 *
 * API routes are NOT gated: the Cashfree webhook can still settle
 * payments made just before maintenance began, and the health endpoint
 * keeps answering. Auth routes are gated with everything else — nobody
 * can sign in while the holding page is up.
 */
export function isMaintenanceMode(): boolean {
  return process.env.MAINTENANCE_MODE === "true";
}

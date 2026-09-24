import { createMiddleware } from "@tanstack/react-start";

/**
 * Attach to every protected Turso server function:
 *   createServerFn(...).middleware([adminMiddleware])
 * Rejects with 401 (no/expired/revoked session) or 403 (not admin).
 */
export const adminMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { requireAdmin } = await import("./auth.server");
  const user = await requireAdmin();
  return next({ context: { user } });
});

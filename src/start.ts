import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
// The app is also rendered inside an embedded preview frame, where the browser
// reports requests as cross-site. Those are allowed only when the calling origin
// is the app itself or a trusted preview host; every other cross-site origin is
// still rejected.
const PREVIEW_ORIGIN_SUFFIXES = [".lovable.app", ".lovableproject.com", ".lovable.dev"];

function isTrustedOrigin(origin: string | null, host: string | null) {
  if (!origin) return false;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (host && origin.endsWith(host)) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return PREVIEW_ORIGIN_SUFFIXES.some((s) => hostname.endsWith(s));
}

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  secFetchSite: (value, ctx) => {
    if (value === "same-origin" || value === "same-site" || value === "none") return true;
    const req = ctx.request;
    return isTrustedOrigin(req.headers.get("origin"), req.headers.get("host"));
  },
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));

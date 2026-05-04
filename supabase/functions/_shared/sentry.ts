import * as Sentry from "npm:@sentry/deno";

export function initSentry() {
    Sentry.init({ 
        dsn: Deno.env.get("SENTRY_DSN") ?? "",
        tracesSampleRate: 0.1
    });
}
export { Sentry };
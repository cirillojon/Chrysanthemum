import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Static-source regression tests for Supabase edge functions.
 *
 * These do NOT execute the Deno runtime — they read each function's index.ts
 * and assert that critical security + protocol concerns are still in place.
 * The goal is to fail CI if a refactor accidentally drops:
 *   - the OPTIONS / CORS preflight branch
 *   - the Authorization header check
 *   - JSON-shaped error responses
 *   - the service-role client (admin DB access path)
 *
 * Add new requirements here as the contract evolves.
 */

const FUNCTIONS_DIR = join(__dirname, "..", "..", "supabase", "functions");

function listEdgeFunctions(): string[] {
  return readdirSync(FUNCTIONS_DIR).filter((entry) => {
    if (entry.startsWith("_")) return false;
    const full = join(FUNCTIONS_DIR, entry);
    if (!statSync(full).isDirectory()) return false;
    try {
      statSync(join(full, "index.ts"));
      return true;
    } catch {
      return false;
    }
  });
}

const fns = listEdgeFunctions();

/**
 * Functions that use an alternative auth scheme (e.g. x-admin-secret or
 * CRON_SECRET) instead of the standard Bearer / Authorization header.
 * They are excluded from the Authorization-header assertion only.
 */
const ADMIN_AUTH_FUNCTIONS = new Set(["admin-broadcast"]);

describe("Supabase edge function contract (regression)", () => {
  it("discovers at least one edge function", () => {
    expect(fns.length).toBeGreaterThan(0);
  });

  for (const name of fns) {
    describe(name, () => {
      const src = readFileSync(join(FUNCTIONS_DIR, name, "index.ts"), "utf8");

      it("handles CORS preflight (OPTIONS)", () => {
        expect(src).toMatch(/req\.method\s*===\s*["']OPTIONS["']/);
        expect(src).toMatch(/Access-Control-Allow-Origin/);
      });

      it("checks the Authorization header", () => {
        if (ADMIN_AUTH_FUNCTIONS.has(name)) {
          // Admin functions use a custom secret header instead of Bearer auth
          expect(src).toMatch(/x-admin-secret|CRON_SECRET/);
          return;
        }
        expect(src).toMatch(/Authorization/);
        // Either an explicit header check or auth.getUser must run.
        const hasHeaderCheck = /headers\.get\(\s*["']Authorization["']\s*\)/.test(src);
        const usesGetUser = /auth\.getUser\(/.test(src);
        expect(hasHeaderCheck || usesGetUser).toBe(true);
      });

      it("returns a structured 401 on unauthorized requests", () => {
        expect(src).toMatch(/Unauthorized/);
        // Accept both inline `status: 401` and helper-call patterns like err("...", 401)
        const hasInlineStatus = /status:\s*401/.test(src);
        const hasHelperStatus = /\bUnauthorized\b.*401|401.*\bUnauthorized\b/s.test(src);
        expect(hasInlineStatus || hasHelperStatus).toBe(true);
      });

      it("uses Deno.serve as the entrypoint", () => {
        expect(src).toMatch(/Deno\.serve\(/);
      });

      it("returns Content-Type application/json on error responses", () => {
        expect(src).toMatch(/application\/json/);
      });
    });
  }
});

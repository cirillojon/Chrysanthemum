// Stub Vite env vars used by src/lib/supabase.ts so any incidental import doesn't throw.
// Tests should not exercise the live Supabase client — pure logic only.
import { vi } from "vitest";

vi.stubEnv("VITE_SUPABASE_URL", "http://localhost");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-test-key");

// Belt-and-suspenders: also patch import.meta.env directly for code paths that
// read it without going through Vite's define-time substitution.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(import.meta as any).env = {
  ...(import.meta as unknown as { env?: Record<string, string> }).env,
  VITE_SUPABASE_URL: "http://localhost",
  VITE_SUPABASE_ANON_KEY: "anon-test-key",
};

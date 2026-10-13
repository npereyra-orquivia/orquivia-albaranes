import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function configuration(url: string, key: string, search = "", hash = "") {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", url);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", key);
  vi.stubGlobal("window", { location: { search, hash } });
  return import("../src/data");
}

describe("Selección del repositorio", () => {
  it("keeps connected mode unless demo is explicitly selected", async () => {
    expect(
      (
        await configuration(
          "https://example.supabase.co",
          "sb_publishable_test",
        )
      ).backendMode,
    ).toBe("supabase");
    expect(
      (
        await configuration(
          "https://example.supabase.co",
          "sb_publishable_test",
          "?demo=1",
        )
      ).backendMode,
    ).toBe("demo");
    expect(
      (
        await configuration(
          "https://example.supabase.co",
          "sb_publishable_test",
          "?demo=0",
        )
      ).backendMode,
    ).toBe("supabase");
  });
  it("shows invalid configuration instead of silently using demo", async () => {
    expect(
      (await configuration("https://example.supabase.co", "")).backendMode,
    ).toBe("invalid");
    expect(
      (await configuration("http://example.supabase.co", "sb_publishable_test"))
        .backendMode,
    ).toBe("invalid");
    expect((await configuration("", "")).backendMode).toBe("demo");
  });
  it("captures an invite before the authentication client consumes its URL", async () => {
    const data = await configuration(
      "",
      "",
      "",
      "#access_token=sample&type=invite",
    );
    window.location.hash = "";
    expect(data.initialPasswordSetup).toBe(true);
    expect(
      (await configuration("", "", "", "#type=recovery")).initialPasswordSetup,
    ).toBe(true);
    expect(
      (await configuration("", "", "", "#type=signup")).initialPasswordSetup,
    ).toBe(false);
  });
});

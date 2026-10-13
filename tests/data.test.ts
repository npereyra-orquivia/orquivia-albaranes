import { beforeEach, describe, expect, it } from "vitest";
import { lineTotalCents, totals, validateOrder } from "../src/data";
import {
  createDemoData,
  createDemoRepository,
  demoProfiles,
} from "../src/demo";
import type { Order } from "../src/types";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}
beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: new EventTarget(),
    configurable: true,
  });
  if (!globalThis.CustomEvent)
    Object.defineProperty(globalThis, "CustomEvent", {
      value: class extends Event {
        detail: unknown;
        constructor(name: string, options?: { detail?: unknown }) {
          super(name);
          this.detail = options?.detail;
        }
      },
      configurable: true,
    });
});

describe("Exact currency totals", () => {
  it("rounds decimal half cents without binary float drift", () => {
    expect(lineTotalCents(1, 1.005)).toBe(101);
    expect(lineTotalCents(0.1, 0.2)).toBe(2);
    expect(lineTotalCents(0.125, 32)).toBe(400);
    expect(lineTotalCents(1e-7, 1_000_000)).toBe(10);
  });
  it("rounds each line and IVA once on the rounded subtotal", () => {
    const result = totals({
      hours: 0.75,
      laborRate: 32,
      vatRate: 21,
      items: [
        { id: "x", description: "", quantity: 3, unit: "ud", unitPrice: 19.99 },
        {
          id: "y",
          description: "",
          quantity: 0.125,
          unit: "m",
          unitPrice: 2.5,
        },
      ],
    });
    expect(result).toEqual({
      materialsCents: 6028,
      laborCents: 2400,
      subtotalCents: 8428,
      vatCents: 1770,
      totalCents: 10198,
      materials: 60.28,
      labor: 24,
      subtotal: 84.28,
      vat: 17.7,
      total: 101.98,
    });
  });
  it("rejects negative, NaN and overflow totals", () => {
    expect(() => lineTotalCents(-1, 10)).toThrow();
    expect(() => lineTotalCents(1, NaN)).toThrow();
    expect(() => lineTotalCents(Number.MAX_SAFE_INTEGER, 100)).toThrow();
  });
});

describe("Validation", () => {
  it("rejects impossible dates and unsupported precision", () => {
    const order = createDemoData().orders[0];
    expect(() =>
      validateOrder({ ...order, serviceDate: "2026-02-30" }),
    ).toThrow("fecha");
    expect(() => validateOrder({ ...order, laborRate: 1.005 })).toThrow(
      "decimales",
    );
    expect(() => validateOrder({ ...order, hours: 0.0001 })).toThrow(
      "decimales",
    );
  });
  it("rejects duplicate materials and empty assistance requests", () => {
    const order = createDemoData().orders[0];
    expect(() =>
      validateOrder({ ...order, items: [order.items[0], order.items[0]] }),
    ).toThrow("único");
    expect(() =>
      validateOrder({ ...order, assistance: true, assistanceNote: "" }),
    ).toThrow("Explica");
  });
});

describe("Explicit offline demonstration", () => {
  it("boots as labeled demo manager once and honors logout", async () => {
    const repo = createDemoRepository(validateOrder);
    expect((await repo.getSession())?.name).toContain("demo");
    await repo.logout();
    expect(await repo.getSession()).toBeNull();
  });
  it("workers only see their own reports and never get prices", async () => {
    const repo = createDemoRepository(validateOrder);
    await repo.selectDemoProfile("worker");
    const data = await repo.load();
    expect(data.orders.length).toBeGreaterThan(0);
    expect(
      data.orders.every(
        (o) =>
          o.createdBy === demoProfiles[1].id &&
          o.laborRate === 0 &&
          o.vatRate === 0 &&
          o.items.every((i) => i.unitPrice === 0),
      ),
    ).toBe(true);
    expect(data.profiles).toHaveLength(1);
    expect(data.company.laborRate).toBe(0);
  });
  it("worker saves preserve manager pricing and record the actor", async () => {
    const repo = createDemoRepository(validateOrder);
    await repo.selectDemoProfile("manager");
    const original = (await repo.load()).orders.find(
      (o) => o.createdBy === demoProfiles[1].id && o.status === "pending",
    )!;
    await repo.selectDemoProfile("worker");
    const redacted = (await repo.load()).orders.find(
      (o) => o.id === original.id,
    )!;
    const saved = await repo.saveOrder(
      {
        ...redacted,
        description: "Se ha confirmado la junta y el material necesario.",
      },
      redacted.version,
    );
    expect(saved.version).toBe(redacted.version + 1);
    expect(saved.laborRate).toBe(0);
    await repo.selectDemoProfile("manager");
    const data = await repo.load();
    const updated = data.orders.find((o) => o.id === original.id)!;
    expect(updated.laborRate).toBe(original.laborRate);
    expect(updated.items[0].unitPrice).toBe(original.items[0].unitPrice);
    expect(
      data.audit.find(
        (a) => a.orderId === original.id && a.action === "Parte actualizado",
      )?.actorName,
    ).toBe(demoProfiles[1].name);
  });
  it("enforces ownership, protected statuses and manager-only settings", async () => {
    const repo = createDemoRepository(validateOrder);
    await repo.selectDemoProfile("manager");
    const all = await repo.load();
    const someoneElse = all.orders.find(
      (o) => o.createdBy !== demoProfiles[1].id,
    )!;
    const priced = all.orders.find(
      (o) => o.createdBy === demoProfiles[1].id && o.status === "valued",
    )!;
    await repo.selectDemoProfile("worker");
    await expect(
      repo.saveOrder(someoneElse, someoneElse.version),
    ).rejects.toThrow("propios");
    await expect(repo.saveOrder(priced, priced.version)).rejects.toThrow(
      "valorado",
    );
    await expect(repo.saveCompany(all.company)).rejects.toThrow("responsable");
    await expect(
      repo.setProfileRole(demoProfiles[1].id, "manager"),
    ).rejects.toThrow("responsable");
  });
  it("prevents stale edits from overwriting a newer version", async () => {
    const repo = createDemoRepository(validateOrder);
    await repo.selectDemoProfile("manager");
    const order = (await repo.load()).orders[0];
    await repo.saveOrder(
      { ...order, notes: "Cambio de primera persona" },
      order.version,
    );
    await expect(
      repo.saveOrder({ ...order, notes: "Cambio obsoleto" }, order.version),
    ).rejects.toThrow("Otra persona");
    expect(
      (await repo.load()).orders.find((o) => o.id === order.id)?.notes,
    ).toBe("Cambio de primera persona");
  });
  it("generates server-owned creator, number and version on new parts", async () => {
    const repo = createDemoRepository(validateOrder);
    await repo.selectDemoProfile("worker");
    const sample = (await repo.load()).orders.find(
      (o) => o.status === "pending",
    )!;
    const newOrder = {
      ...sample,
      id: crypto.randomUUID(),
      status: "pending" as const,
      createdBy: "forged",
      number: "FORGED",
      version: 999,
      createdByName: "Forged",
    } satisfies Order;
    const saved = await repo.saveOrder(newOrder);
    expect(saved.createdBy).toBe(demoProfiles[1].id);
    expect(saved.number).toMatch(/^ALB-\d{4}-\d{4}$/);
    expect(saved.version).toBe(1);
  });
});

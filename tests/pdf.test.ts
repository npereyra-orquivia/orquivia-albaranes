import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createDemoData } from "../src/demo";
import { deliveryNoteFilename, generateDeliveryNote } from "../src/pdf";

async function inspect(blob: Blob) {
  const raw = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(
    (match) => {
      try {
        return inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
      } catch {
        return match[1];
      }
    },
  );
  return {
    raw,
    content: streams.join("\n"),
    pages: [...raw.matchAll(/\/Type \/Page\b/g)].length,
  };
}

describe("Albarán PDF", () => {
  it("uses the same exact line rounding and VAT as the valuation", async () => {
    const data = createDemoData();
    const order = {
      ...data.orders[0],
      hours: 0,
      vatRate: 21,
      assistance: true,
      assistanceNote: "INTERNAL_ONLY",
      items: [{ ...data.orders[0].items[0], quantity: 1.125, unitPrice: 25.8 }],
    };
    const result = await inspect(
      generateDeliveryNote(order, data.company, data.clients[0]),
    );
    expect(result.raw.startsWith("%PDF-")).toBe(true);
    expect(result.raw).toContain("/Creator (Orquivia - Control de albaranes)");
    expect(result.content).toContain("29,03");
    expect(result.content).toContain("6,10 EUR");
    expect(result.content).toContain("35,13 EUR");
    expect(result.content).not.toContain("INTERNAL_ONLY");
    expect(result.content).not.toContain("DATOS DE EJEMPLO");
  });

  it("paginates all materials and notes, marks only demo documents", async () => {
    const data = createDemoData();
    const order = structuredClone(data.orders[0]);
    order.description = Array.from(
      { length: 45 },
      (_, i) =>
        `Descripcion${i + 1}: Comprobar conexiones y sustituir los elementos averiados de la unidad indicada.`,
    ).join("\n");
    order.items = Array.from({ length: 100 }, (_, i) => ({
      ...order.items[0],
      id: crypto.randomUUID(),
      description: `MaterialNumero${i + 1}: Perfil y anclaje para la unidad.`,
    }));
    order.notes = "ULTIMA_OBSERVACION";
    const result = await inspect(
      generateDeliveryNote(order, data.company, data.clients[0], {
        demo: true,
      }),
    );
    expect(result.pages).toBeGreaterThan(1);
    for (let i = 1; i <= 100; i++)
      expect(result.content).toContain(`MaterialNumero${i}:`);
    expect(result.content).toContain("Descripcion45:");
    expect(result.content).toContain("ULTIMA_OBSERVACION");
    expect(result.content).toContain("CONFORMIDAD DEL CLIENTE");
    expect(result.content.match(/DATOS DE EJEMPLO/g)).toHaveLength(
      result.pages,
    );
  });

  it("makes a safe filename from the document number", () => {
    const order = createDemoData().orders[0];
    expect(
      deliveryNoteFilename({ ...order, number: "../../ALB:2026\\42" }),
    ).toBe("albaran-..-..-ALB-2026-42.pdf");
    expect(deliveryNoteFilename({ ...order, number: "" })).toBe(
      "albaran-servicio.pdf",
    );
  });
});

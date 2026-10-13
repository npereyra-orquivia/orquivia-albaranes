import { jsPDF } from "jspdf";
import { lineTotalCents, totals } from "./data";
import type { Client, Company, Order } from "./types";

type DeliveryNoteOptions = { demo?: boolean };

const INK: [number, number, number] = [25, 42, 40];
const GREEN: [number, number, number] = [22, 79, 70];
const MUTED: [number, number, number] = [106, 118, 116];
const LINE: [number, number, number] = [219, 227, 224];
const PALE: [number, number, number] = [245, 248, 246];
const MARGIN = 18;
const RIGHT = 192;
const WIDTH = RIGHT - MARGIN;
const BOTTOM = 269;

const textValue = (value: unknown) =>
  String(value ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
const euros = (cents: number) =>
  `${(cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
const decimal = (value: number) =>
  value.toLocaleString("es-ES", { maximumFractionDigits: 3 });
const dateLabel = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : textValue(value);
};
const locationLabels = {
  unit: "Unidad / local",
  common: "Zona común",
  exterior: "Exterior",
  other: "Otra ubicación",
};

export function deliveryNoteFilename(order: Order): string {
  const number = textValue(order.number).replace(/[^a-zA-Z0-9._-]/g, "-");
  return `albaran-${number || "servicio"}.pdf`;
}

/** Genera el documento en el dispositivo; no transmite datos ni registra un envío. */
export function generateDeliveryNote(
  order: Order,
  company: Company,
  client: Client | undefined,
  options: DeliveryNoteOptions = {},
): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `Albarán ${textValue(order.number)}`,
    subject: textValue(order.title),
    author: textValue(company.name),
    creator: "Orquivia - Control de albaranes",
  });
  let y = 18;

  const font = (
    size = 10,
    weight: "normal" | "bold" = "normal",
    color = INK,
  ) => {
    doc.setFont("helvetica", weight);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const rule = (at: number) => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, at, RIGHT, at);
  };
  const nextPage = () => {
    doc.addPage();
    font(11, "bold", GREEN);
    doc.text("ALBARÁN", MARGIN, 20);
    font(9, "normal", MUTED);
    doc.text(textValue(order.number), RIGHT, 20, { align: "right" });
    rule(26);
    y = 35;
  };
  const fit = (height: number) => {
    if (y + height > BOTTOM) nextPage();
  };
  const lines = (
    value: unknown,
    width = WIDTH,
    size = 10,
    weight: "normal" | "bold" = "normal",
  ): string[] => {
    font(size, weight);
    return doc.splitTextToSize(textValue(value) || "-", width) as string[];
  };
  const paragraph = (value: unknown, size = 10, color = INK, after = 5) => {
    for (const line of lines(value, WIDTH, size)) {
      fit(5.3);
      font(size, "normal", color);
      doc.text(line, MARGIN, y);
      y += 5.3;
    }
    y += after;
  };
  const section = (label: string) => {
    fit(17);
    font(9, "bold", GREEN);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 7;
  };

  // Identificación del emisor y del documento.
  font(22, "bold", GREEN);
  doc.text("ALBARÁN", RIGHT, 25, { align: "right" });
  font(11, "bold");
  doc.text(textValue(order.number), RIGHT, 33, { align: "right" });
  font(9, "normal", MUTED);
  doc.text(`Fecha de servicio: ${dateLabel(order.serviceDate)}`, RIGHT, 40, {
    align: "right",
  });
  const companyName = lines(company.name, 104, 15, "bold");
  font(15, "bold", GREEN);
  doc.text(companyName, MARGIN, 24, { lineHeightFactor: 1.2 });
  let issuerY = 24 + companyName.length * 6.4;
  const issuerDetails = [
    company.taxId ? `NIF: ${company.taxId}` : "",
    company.address,
    [company.phone, company.email].filter(Boolean).join(" | "),
  ].filter(Boolean);
  for (const detail of issuerDetails) {
    const detailLines = lines(detail, 104, 8.5);
    font(8.5, "normal", MUTED);
    doc.text(detailLines, MARGIN, issuerY, { lineHeightFactor: 1.35 });
    issuerY += detailLines.length * 4.2;
  }
  y = Math.max(issuerY + 7, 52);
  rule(y);
  y += 11;

  // Cliente y ubicación, con altura calculada a partir del contenido.
  const customer = [
    client?.name || order.clientName,
    client?.taxId ? `NIF: ${client.taxId}` : "",
    client?.address,
    [client?.phone, client?.email].filter(Boolean).join(" | "),
  ].filter(Boolean);
  const location = [
    order.site || client?.site,
    `${locationLabels[order.locationType]}: ${order.locationDetail}`,
  ].filter(Boolean);
  const customerLines = customer.flatMap((value) => lines(value, 76, 9));
  const locationLines = location.flatMap((value) => lines(value, 76, 9));
  const cardHeight =
    17 + Math.max(customerLines.length, locationLines.length) * 4.8;
  if (cardHeight < BOTTOM - 35) {
    fit(cardHeight + 8);
    const card = (x: number, label: string, content: string[]) => {
      doc.setFillColor(...PALE);
      doc.roundedRect(x, y, 85, cardHeight, 2, 2, "F");
      font(8, "bold", GREEN);
      doc.text(label, x + 5, y + 7);
      font(9);
      doc.text(content.length ? content : ["-"], x + 5, y + 14, {
        lineHeightFactor: 1.5,
      });
    };
    card(MARGIN, "CLIENTE", customerLines);
    card(107, "UBICACIÓN DEL TRABAJO", locationLines);
    y += cardHeight + 10;
  } else {
    section("Cliente");
    customer.forEach((value) => paragraph(value, 9, INK, 1));
    section("Ubicación del trabajo");
    location.forEach((value) => paragraph(value, 9, INK, 1));
    y += 5;
  }

  section("Trabajo realizado / solicitado");
  const titleLines = lines(order.title, WIDTH, 13, "bold");
  for (const line of titleLines) {
    fit(6);
    font(13, "bold");
    doc.text(line, MARGIN, y);
    y += 6;
  }
  y += 3;
  paragraph(order.description);
  section("Materiales y mano de obra");
  const columns = [MARGIN, 106, 126, 145, 168, RIGHT];
  const tableHeader = () => {
    fit(10);
    doc.setFillColor(...GREEN);
    doc.rect(MARGIN, y - 4.5, WIDTH, 9, "F");
    font(8, "bold", [255, 255, 255]);
    doc.text("CONCEPTO", MARGIN + 3, y + 1);
    doc.text("CANT.", columns[2] - 3, y + 1, { align: "right" });
    doc.text("UD.", columns[3] - 3, y + 1, { align: "right" });
    doc.text("PRECIO EUR", columns[4] - 3, y + 1, { align: "right" });
    doc.text("IMPORTE EUR", RIGHT - 3, y + 1, { align: "right" });
    y += 10;
  };
  tableHeader();
  const rows = order.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    price: lineTotalCents(1, item.unitPrice),
    amount: lineTotalCents(item.quantity, item.unitPrice),
  }));
  rows.push({
    description: "Mano de obra",
    quantity: order.hours,
    unit: "h",
    price: lineTotalCents(1, order.laborRate),
    amount: lineTotalCents(order.hours, order.laborRate),
  });
  rows.forEach((row, index) => {
    const description = lines(row.description, 80, 9);
    const units = lines(row.unit, 15, 8);
    const rowLines = Math.max(description.length, units.length);
    let offset = 0;
    while (offset < rowLines) {
      if (y + 8 > BOTTOM) {
        nextPage();
        tableHeader();
      }
      const available = Math.max(1, Math.floor((BOTTOM - y - 4) / 4.7));
      const count = Math.min(rowLines - offset, available);
      const height = Math.max(9, count * 4.7 + 4);
      if (index % 2 === 0) {
        doc.setFillColor(...PALE);
        doc.rect(MARGIN, y - 3, WIDTH, height, "F");
      }
      font(9);
      const conceptLines = description.slice(offset, offset + count);
      if (conceptLines.length)
        doc.text(conceptLines, MARGIN + 3, y + 1, { lineHeightFactor: 1.48 });
      font(8);
      const unitLines = units.slice(offset, offset + count);
      if (unitLines.length)
        doc.text(unitLines, columns[3] - 3, y + 1, {
          align: "right",
          lineHeightFactor: 1.65,
        });
      if (offset === 0) {
        doc.text(decimal(row.quantity), columns[2] - 3, y + 1, {
          align: "right",
        });
        doc.text(euros(row.price).replace(" EUR", ""), columns[4] - 3, y + 1, {
          align: "right",
        });
        doc.text(euros(row.amount).replace(" EUR", ""), RIGHT - 3, y + 1, {
          align: "right",
        });
      }
      y += height;
      rule(y - 3);
      offset += count;
      if (offset < rowLines) {
        nextPage();
        tableHeader();
      }
    }
  });
  y += 8;

  const amount = totals(order);
  fit(37);
  const totalLine = (label: string, cents: number, strong = false) => {
    font(strong ? 12 : 10, strong ? "bold" : "normal", strong ? GREEN : INK);
    doc.text(label, 119, y);
    doc.text(euros(cents), RIGHT - 3, y, { align: "right" });
    y += strong ? 9 : 7;
  };
  totalLine("Base imponible", amount.subtotalCents);
  totalLine(`IVA (${decimal(order.vatRate)} %)`, amount.vatCents);
  doc.setDrawColor(...LINE);
  doc.line(117, y - 3.5, RIGHT, y - 3.5);
  totalLine("TOTAL", amount.totalCents, true);
  y += 6;

  if (order.notes) {
    section("Observaciones");
    paragraph(order.notes, 9);
  }
  fit(38);
  font(8, "normal", MUTED);
  doc.text(
    `Registrado por: ${textValue(order.createdByName) || "-"}`,
    MARGIN,
    y,
  );
  y += 9;
  doc.setDrawColor(...LINE);
  doc.roundedRect(MARGIN, y, 85, 25, 1.5, 1.5);
  doc.roundedRect(107, y, 85, 25, 1.5, 1.5);
  font(8, "bold", GREEN);
  doc.text("REALIZADO POR", MARGIN + 5, y + 6);
  doc.text("CONFORMIDAD DEL CLIENTE", 112, y + 6);
  font(8, "normal", MUTED);
  doc.text("Nombre y firma:", MARGIN + 5, y + 12);
  doc.text("Nombre y firma:", 112, y + 12);

  // Paginación al final para conocer el total. La muestra lleva una marca explícita.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    if (options.demo) {
      font(10, "bold", [172, 103, 42]);
      doc.text("DEMOSTRACIÓN - DATOS DE EJEMPLO", 105, 287, {
        align: "center",
      });
    }
    rule(278);
    font(8, "normal", MUTED);
    doc.text(textValue(order.number), MARGIN, 283);
    doc.text(`${page} / ${pages}`, RIGHT, 283, { align: "right" });
  }
  return doc.output("blob");
}

export function downloadDeliveryNote(
  order: Order,
  company: Company,
  client: Client | undefined,
  options: DeliveryNoteOptions = {},
): void {
  const blob = generateDeliveryNote(order, company, client, options);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = deliveryNoteFilename(order);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Dar tiempo al navegador para iniciar la descarga antes de retirar la URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

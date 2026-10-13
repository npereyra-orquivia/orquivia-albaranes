import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDemoRepository } from "./demo";
import type {
  AppData,
  AppRepository,
  Company,
  DataEvent,
  Order,
  OrderDraft,
  Profile,
} from "./types";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
const requestedDemo =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location?.search ?? "").get("demo") === "1";
export const initialPasswordSetup =
  typeof window !== "undefined" &&
  ["invite", "recovery"].includes(
    new URLSearchParams(window.location?.hash?.slice(1) ?? "").get("type") ??
      "",
  );
export const backendMode: "demo" | "supabase" | "invalid" =
  requestedDemo || (!configuredUrl && !configuredKey)
    ? "demo"
    : configuredUrl && configuredKey && /^https:\/\//.test(configuredUrl)
      ? "supabase"
      : "invalid";
export const isDemo = backendMode === "demo";

function decimal(value: number): { amount: bigint; denominator: bigint } {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(
      "Los importes y cantidades deben ser números positivos o cero.",
    );
  const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const shift = Number(exponent) - fraction.length;
  const digits = BigInt(whole + fraction);
  return shift >= 0
    ? { amount: digits * 10n ** BigInt(shift), denominator: 1n }
    : { amount: digits, denominator: 10n ** BigInt(-shift) };
}
function roundedRatio(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}
function safeInteger(amount: bigint): number {
  const n = Number(amount);
  if (!Number.isSafeInteger(n))
    throw new Error("El importe supera el máximo admitido.");
  return n;
}
export function lineTotalCents(quantity: number, price: number): number {
  const q = decimal(quantity),
    p = decimal(price);
  return safeInteger(
    roundedRatio(q.amount * p.amount * 100n, q.denominator * p.denominator),
  );
}
export function totals(
  order: Pick<Order, "hours" | "laborRate" | "vatRate" | "items">,
) {
  const materialsCents = order.items.reduce(
    (sum, item) => sum + lineTotalCents(item.quantity, item.unitPrice),
    0,
  );
  const laborCents = lineTotalCents(order.hours, order.laborRate);
  const subtotalCents = materialsCents + laborCents;
  if (!Number.isSafeInteger(subtotalCents))
    throw new Error("El importe supera el máximo admitido.");
  const rate = decimal(order.vatRate);
  const vatCents = safeInteger(
    roundedRatio(BigInt(subtotalCents) * rate.amount, rate.denominator * 100n),
  );
  const totalCents = subtotalCents + vatCents;
  if (!Number.isSafeInteger(totalCents))
    throw new Error("El importe supera el máximo admitido.");
  return {
    materialsCents,
    laborCents,
    subtotalCents,
    vatCents,
    totalCents,
    materials: materialsCents / 100,
    labor: laborCents / 100,
    subtotal: subtotalCents / 100,
    vat: vatCents / 100,
    total: totalCents / 100,
  };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function numberField(
  value: number,
  name: string,
  maximum = 1_000_000,
  places = 2,
) {
  if (!Number.isFinite(value) || value < 0 || value > maximum)
    throw new Error(`${name}: introduce un número entre 0 y ${maximum}.`);
  const d = decimal(value);
  if ((d.amount * 10n ** BigInt(places)) % d.denominator !== 0n)
    throw new Error(`${name}: utiliza como máximo ${places} decimales.`);
}
function required(value: string, name: string, maximum = 5000) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new Error(
      `${name}: completa este campo (máximo ${maximum} caracteres).`,
    );
}
export function validateOrder(order: OrderDraft) {
  if (!uuid.test(order.id) || !uuid.test(order.clientId))
    throw new Error("El parte o cliente no tiene un identificador válido.");
  required(order.title, "Trabajo", 160);
  required(order.description, "Descripción del trabajo");
  required(order.site, "Centro o recinto", 200);
  required(order.locationDetail, "Ubicación", 200);
  if (!["unit", "common", "exterior", "other"].includes(order.locationType))
    throw new Error("Selecciona un tipo de ubicación válido.");
  if (
    !["normal", "urgent"].includes(order.priority) ||
    !["pending", "review", "valued", "sent"].includes(order.status)
  )
    throw new Error("Prioridad o estado no válido.");
  const date = new Date(`${order.serviceDate}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(order.serviceDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== order.serviceDate
  )
    throw new Error("Introduce una fecha de trabajo válida.");
  numberField(order.hours, "Horas", 10000, 3);
  numberField(order.laborRate, "Precio por hora");
  numberField(order.vatRate, "IVA", 100);
  if (order.notes.length > 5000 || order.assistanceNote.length > 2000)
    throw new Error("Las notas son demasiado largas.");
  if (order.assistance && !order.assistanceNote.trim())
    throw new Error("Explica qué necesitas confirmar con el responsable.");
  if (!Array.isArray(order.items) || order.items.length > 100)
    throw new Error("Se permiten hasta 100 líneas de material.");
  const itemIds = new Set<string>();
  for (const item of order.items) {
    if (!uuid.test(item.id) || itemIds.has(item.id))
      throw new Error("Cada material debe tener un identificador único.");
    itemIds.add(item.id);
    required(item.description, "Descripción del material", 300);
    required(item.unit, "Unidad de medida", 30);
    numberField(item.quantity, "Cantidad de material", 1_000_000, 3);
    if (item.quantity === 0)
      throw new Error("La cantidad de material debe ser mayor que cero.");
    numberField(item.unitPrice, "Precio del material");
  }
  if (!Array.isArray(order.photos) || order.photos.length > 12)
    throw new Error("Se permiten hasta 12 fotos por parte.");
  totals(order);
}
function validateCompany(company: Company) {
  required(company.name, "Nombre de empresa", 200);
  numberField(company.defaultVat, "IVA", 100);
  numberField(company.laborRate, "Precio por hora");
}
function validatePhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Adjunta una foto JPG, PNG o WebP.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("La foto no puede superar 5 MB.");
  if (!file.size) throw new Error("La foto está vacía.");
}
function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.message.includes("VERSION_CONFLICT"))
    throw new Error(
      "Otra persona ha modificado este parte. Recarga antes de guardar para no sobrescribir sus cambios.",
    );
  if (error.message.includes("NO_PROFILE"))
    throw new Error(
      "Tu cuenta aún no tiene acceso a esta empresa. Pide al responsable que active tu usuario.",
    );
  if (error.message.includes("FORBIDDEN"))
    throw new Error("Tu usuario no tiene permiso para realizar esta acción.");
  if (error.message.includes("LOCKED_ORDER"))
    throw new Error(
      "Este parte ya ha sido valorado. El responsable debe realizar los cambios.",
    );
  throw new Error(error.message);
}

function createSupabaseRepository(client: SupabaseClient): AppRepository {
  async function profile(): Promise<Profile | null> {
    const { data, error } = await client.auth.getSession();
    fail(error);
    if (!data.session) return null;
    const result = await client
      .from("profiles")
      .select("id,name,role,email")
      .eq("id", data.session.user.id)
      .eq("active", true)
      .maybeSingle();
    fail(result.error);
    if (!result.data)
      throw new Error(
        "Tu cuenta aún no tiene acceso a esta empresa. Pide al responsable que active tu usuario.",
      );
    return { ...result.data, email: data.session.user.email } as Profile;
  }
  async function rpc<T>(
    name: string,
    parameters?: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await client.rpc(name, parameters);
    fail(error);
    return data as T;
  }
  return {
    getSession: profile,
    async login(email, password) {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      fail(error);
      const p = await profile();
      if (!p) throw new Error("No se pudo iniciar sesión.");
      return p;
    },
    async logout() {
      const { error } = await client.auth.signOut();
      fail(error);
    },
    async resetPassword(email) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      });
      fail(error);
    },
    async updatePassword(password) {
      if (password.length < 8)
        throw new Error("La contraseña debe tener al menos 8 caracteres.");
      const { error } = await client.auth.updateUser({ password });
      fail(error);
    },
    async selectDemoProfile() {
      throw new Error(
        "Esta aplicación está conectada a Supabase. Utiliza tu cuenta de empresa.",
      );
    },
    async load() {
      return rpc<AppData>("load_app");
    },
    async saveOrder(order, expectedVersion) {
      validateOrder(order);
      return rpc<Order>("save_order", {
        payload: order,
        expected_version: expectedVersion ?? 0,
      });
    },
    async saveCompany(company) {
      validateCompany(company);
      await rpc("save_company", { payload: company });
    },
    async saveClient(client) {
      required(client.name, "Nombre de cliente", 200);
      if (!uuid.test(client.id))
        throw new Error("El cliente no tiene un identificador válido.");
      return rpc("save_client", { payload: client });
    },
    async setProfileRole(id, role) {
      await rpc("set_profile_role", { target_id: id, new_role: role });
    },
    async uploadPhoto(orderId, file) {
      validatePhoto(file);
      if (!uuid.test(orderId))
        throw new Error("Guarda el parte antes de adjuntar una foto.");
      const id = crypto.randomUUID(),
        extension =
          file.type === "image/jpeg"
            ? "jpg"
            : file.type === "image/png"
              ? "png"
              : "webp";
      const path = `${orderId}/${id}.${extension}`;
      const { error } = await client.storage
        .from("order-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      fail(error);
      const signed = await client.storage
        .from("order-photos")
        .createSignedUrl(path, 3600);
      fail(signed.error);
      return { id, path, name: file.name, url: signed.data?.signedUrl };
    },
    async getPhotoUrl(path) {
      const { data, error } = await client.storage
        .from("order-photos")
        .createSignedUrl(path, 3600);
      fail(error);
      if (!data) throw new Error("No se pudo abrir la foto.");
      return data.signedUrl;
    },
    subscribe(callback) {
      let active = true;
      // Supabase holds an auth lock while notifying listeners. Schedule callers
      // afterward so their getSession/load requests cannot wait on that same lock.
      const { data: auth } = client.auth.onAuthStateChange((event) => {
        setTimeout(() => {
          if (active)
            callback({
              kind: event === "PASSWORD_RECOVERY" ? "recovery" : "auth",
            });
        }, 0);
      });
      const channel = client
        .channel(`partes-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          (payload) =>
            callback({
              kind: "orders",
              newOrderId:
                payload.eventType === "INSERT"
                  ? String(payload.new.id)
                  : undefined,
            }),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "audit_entries" },
          () => callback({ kind: "audit" }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "company" },
          () => callback({ kind: "settings" }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "clients" },
          () => callback({ kind: "settings" }),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles" },
          () => callback({ kind: "settings" }),
        )
        .subscribe();
      return () => {
        active = false;
        auth.subscription.unsubscribe();
        void client.removeChannel(channel);
      };
    },
  };
}

const invalid = async (): Promise<never> => {
  throw new Error(
    "Configuración incompleta de Supabase: define VITE_SUPABASE_URL (https) y VITE_SUPABASE_ANON_KEY y vuelve a compilar la aplicación.",
  );
};
const invalidRepository: AppRepository = {
  getSession: invalid,
  login: invalid,
  logout: invalid,
  resetPassword: invalid,
  updatePassword: invalid,
  selectDemoProfile: invalid,
  load: invalid,
  saveOrder: invalid,
  saveCompany: invalid,
  saveClient: invalid,
  setProfileRole: invalid,
  uploadPhoto: invalid,
  getPhotoUrl: invalid,
  subscribe: () => () => undefined,
};
const baseRepository =
  backendMode === "supabase"
    ? createSupabaseRepository(createClient(configuredUrl, configuredKey))
    : backendMode === "demo"
      ? createDemoRepository(validateOrder)
      : invalidRepository;
export const repository: AppRepository = {
  ...baseRepository,
  async saveCompany(company) {
    validateCompany(company);
    return baseRepository.saveCompany(company);
  },
  async saveClient(client) {
    required(client.name, "Nombre de cliente", 200);
    if (!uuid.test(client.id))
      throw new Error("El cliente no tiene un identificador válido.");
    return baseRepository.saveClient(client);
  },
  async uploadPhoto(orderId, file) {
    validatePhoto(file);
    return baseRepository.uploadPhoto(orderId, file);
  },
};

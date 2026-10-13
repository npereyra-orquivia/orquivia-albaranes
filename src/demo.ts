import type {
  AppData,
  AppRepository,
  AuditEntry,
  Company,
  DataEvent,
  Order,
  OrderDraft,
  OrderPhoto,
  Profile,
  Role,
} from "./types";

const DATA_KEY = "partes-demo-v1";
const SESSION_KEY = "partes-demo-session-v1";
const FIRST_VISIT_KEY = "partes-demo-visited-v1";
const EVENT_NAME = "partes-demo-change";
export const demoProfiles: Profile[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Laura Martín · demo",
    role: "manager",
    email: "responsable@example.invalid",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Carlos Ruiz · demo",
    role: "worker",
    email: "operario@example.invalid",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Ana López · demo",
    role: "worker",
    email: "ana@example.invalid",
  },
];

export function createDemoData(): AppData {
  const now = new Date();
  const date = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Madrid",
    }).format(d);
  };
  const stamp = (days: number, hour: number) =>
    `${date(days)}T${String(hour).padStart(2, "0")}:15:00.000Z`;
  const clients = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Centro Comercial Los Olivos · ficticio",
      taxId: "",
      email: "mantenimiento@example.invalid",
      phone: "900 000 000",
      address: "Avenida de ejemplo, 12 · Madrid",
      site: "Centro Comercial Los Olivos",
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      name: "Galería Norte · ficticio",
      taxId: "",
      email: "galeria@example.invalid",
      phone: "900 000 001",
      address: "Calle de muestra, 8 · Madrid",
      site: "Galería Norte",
    },
  ];
  const specs = [
    [
      "Reparar falso techo",
      "Placa del falso techo dañada. Revisada la perfilería; se necesita sustituir la placa y repasar el encuentro.",
      "unit",
      "Unidad 12 · entrada principal",
      "urgent",
      "pending",
      0,
      10,
      false,
    ],
    [
      "Repasar pintura del local",
      "Pared con desconchones junto a la entrada. Preparar el soporte y confirmar el color antes de pintar.",
      "unit",
      "Unidad 08 · pared de acceso",
      "normal",
      "review",
      0,
      9,
      true,
    ],
    [
      "Reponer señalética de galería",
      "Sustituidos dos soportes de señalética deteriorados y comprobadas las fijaciones.",
      "common",
      "Galería · planta 1",
      "normal",
      "valued",
      1,
      16,
      false,
    ],
    [
      "Ajustar puerta de acceso",
      "Ajustado el cierrapuertas y lubricadas las bisagras. La puerta vuelve a cerrar correctamente.",
      "unit",
      "Unidad 08 · puerta lateral",
      "normal",
      "sent",
      1,
      12,
      false,
    ],
    [
      "Sellar junta exterior",
      "Junta abierta en el perímetro del recinto. Limpiar el soporte y confirmar el sellador adecuado.",
      "exterior",
      "Perímetro sur · fachada",
      "normal",
      "pending",
      2,
      11,
      true,
    ],
    [
      "Reponer zócalo del acceso",
      "Tramo de zócalo desprendido. Repuesto el tramo y repasadas las juntas.",
      "common",
      "Acceso sur · junto a la puerta",
      "normal",
      "valued",
      2,
      9,
      false,
    ],
    [
      "Ajustar puerta de almacén",
      "La puerta roza con el suelo. Ajustadas bisagras y probado el cierre.",
      "other",
      "Almacén de mantenimiento",
      "normal",
      "pending",
      0,
      8,
      false,
    ],
  ] as const;
  const orders: Order[] = specs.map((s, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    number: `ALB-${now.getFullYear()}-${String(index + 1).padStart(4, "0")}`,
    title: s[0],
    description: s[1],
    clientId: clients[index === 6 ? 1 : 0].id,
    clientName: clients[index === 6 ? 1 : 0].name,
    site: clients[index === 6 ? 1 : 0].site,
    locationType: s[2],
    locationDetail: s[3],
    priority: s[4],
    status: s[5],
    createdBy: demoProfiles[index % 3 === 0 ? 2 : 1].id,
    createdByName: demoProfiles[index % 3 === 0 ? 2 : 1].name,
    createdAt: stamp(s[6], s[7]),
    updatedAt: stamp(s[6], s[7]),
    serviceDate: date(s[6]),
    hours: [1.5, 1, 2, 0.75, 1.5, 1, 0.5][index],
    laborRate: 32,
    vatRate: 21,
    items: [
      {
        id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        description: [
          "Placa de falso techo 60 × 60",
          "Pintura plástica (color por confirmar)",
          "Soporte para señalética",
          "Lubricante",
          "Sellador exterior (por confirmar)",
          "Tramo de zócalo",
          "Juego de tornillos para bisagra",
        ][index],
        quantity: index === 2 ? 2 : 1,
        unit: "ud",
        unitPrice: [18.5, 14.9, 22.5, 6.2, 28, 12.5, 8.9][index],
      },
    ],
    notes:
      index === 1
        ? "Coordinar el acceso fuera del horario de mayor afluencia."
        : "",
    assistance: s[8],
    assistanceNote: s[8]
      ? "Necesito confirmar el material adecuado con el responsable."
      : "",
    version: 1,
    photos: [],
  }));
  return {
    company: {
      name: "Orquivia",
      taxId: "",
      address: "",
      email: "",
      phone: "",
      defaultVat: 21,
      laborRate: 32,
    },
    clients,
    orders,
    profiles: structuredClone(demoProfiles),
    audit: orders.map((o) => ({
      id: crypto.randomUUID(),
      orderId: o.id,
      actorName: o.createdByName,
      action: "Parte creado",
      createdAt: o.createdAt,
      changes: { title: o.title },
    })),
  };
}

function readData(): AppData {
  const raw = localStorage.getItem(DATA_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw) as AppData;
      if (
        Array.isArray(data.orders) &&
        data.company &&
        Array.isArray(data.profiles)
      )
        return data;
    } catch {
      /* Tell the user below; never discard stored work. */
    }
    throw new Error(
      "Los datos de demostración guardados no se pueden leer. Exporta o elimina los datos locales desde tu navegador para reiniciar la demo.",
    );
  }
  const data = createDemoData();
  writeData(data);
  return data;
}
function writeData(data: AppData) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    throw new Error(
      "No hay espacio para guardar la demo en este navegador. Reduce las fotos o libera almacenamiento local.",
    );
  }
}
function notify(event: DataEvent) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: event }));
}
function currentProfile(): Profile | null {
  if (!localStorage.getItem(FIRST_VISIT_KEY)) {
    localStorage.setItem(FIRST_VISIT_KEY, "true");
    localStorage.setItem(SESSION_KEY, demoProfiles[0].id);
  }
  const id = localStorage.getItem(SESSION_KEY);
  return id ? (readData().profiles.find((p) => p.id === id) ?? null) : null;
}
function requireProfile(): Profile {
  const profile = currentProfile();
  if (!profile) throw new Error("Entra en la demostración para continuar.");
  return profile;
}
function requireManager(): Profile {
  const p = requireProfile();
  if (p.role !== "manager")
    throw new Error("Esta acción requiere acceso de responsable.");
  return p;
}
function safeOrder(order: Order, profile: Profile): Order {
  const copy = structuredClone(order);
  if (profile.role === "worker") {
    copy.laborRate = 0;
    copy.vatRate = 0;
    copy.items = copy.items.map((i) => ({ ...i, unitPrice: 0 }));
  }
  return copy;
}
function addAudit(
  data: AppData,
  profile: Profile,
  orderId: string | undefined,
  action: string,
  changes: AuditEntry["changes"] = {},
) {
  data.audit.unshift({
    id: crypto.randomUUID(),
    orderId,
    actorName: profile.name,
    action,
    changes,
    createdAt: new Date().toISOString(),
  });
}

export function createDemoRepository(
  validateOrder: (order: OrderDraft) => void,
): AppRepository {
  return {
    async getSession() {
      return currentProfile();
    },
    async login() {
      throw new Error(
        "La demo no usa contraseñas. Elige «Responsable demo» u «Operario demo».",
      );
    },
    async logout() {
      localStorage.setItem(FIRST_VISIT_KEY, "true");
      localStorage.removeItem(SESSION_KEY);
      notify({ kind: "auth" });
    },
    async resetPassword() {
      throw new Error(
        "La recuperación de contraseña está disponible al conectar Supabase.",
      );
    },
    async updatePassword() {
      throw new Error("La demo no utiliza contraseñas.");
    },
    async selectDemoProfile(role) {
      const data = readData();
      const p = data.profiles.find(
        (p) =>
          p.id === demoProfiles[role === "manager" ? 0 : 1].id &&
          p.role === role,
      );
      if (!p)
        throw new Error(
          "Este perfil demo ya tiene otro rol. Accede con el perfil responsable disponible.",
        );
      localStorage.setItem(FIRST_VISIT_KEY, "true");
      localStorage.setItem(SESSION_KEY, p.id);
      notify({ kind: "auth" });
      return structuredClone(p);
    },
    async load() {
      const p = requireProfile(),
        data = readData();
      const orders = data.orders.filter(
        (o) => p.role === "manager" || o.createdBy === p.id,
      );
      const ids = new Set(orders.map((o) => o.id));
      return {
        ...structuredClone(data),
        orders: orders.map((o) => safeOrder(o, p)),
        company: {
          ...data.company,
          laborRate: p.role === "manager" ? data.company.laborRate : 0,
        },
        profiles: data.profiles.filter(
          (q) => p.role === "manager" || q.id === p.id,
        ),
        audit: data.audit
          .filter(
            (a) =>
              p.role === "manager" ||
              (a.orderId &&
                ids.has(a.orderId) &&
                a.action !== "Valoración actualizada"),
          )
          .map((a) => (p.role === "manager" ? a : { ...a, changes: {} })),
      };
    },
    async saveOrder(draft, expectedVersion) {
      validateOrder(draft);
      const p = requireProfile(),
        data = readData(),
        previous = data.orders.find((o) => o.id === draft.id);
      if (previous && expectedVersion !== previous.version)
        throw new Error(
          "Otra persona ha modificado este parte. Recarga antes de guardar para no sobrescribir sus cambios.",
        );
      if (!previous && expectedVersion !== undefined && expectedVersion !== 0)
        throw new Error("El parte ya no existe. Recarga antes de guardar.");
      if (p.role === "worker" && previous && previous.createdBy !== p.id)
        throw new Error("Solo puedes editar tus propios partes.");
      if (
        p.role === "worker" &&
        previous &&
        ["valued", "sent"].includes(previous.status)
      )
        throw new Error(
          "Este parte ya ha sido valorado. El responsable debe realizar los cambios.",
        );
      if (p.role === "worker" && !["pending", "review"].includes(draft.status))
        throw new Error(
          "Solo el responsable puede valorar o enviar un albarán.",
        );
      const now = new Date().toISOString();
      const order: Order = {
        ...structuredClone(draft),
        number:
          previous?.number ??
          `ALB-${new Date().getFullYear()}-${String(data.orders.length + 1).padStart(4, "0")}`,
        createdBy: previous?.createdBy ?? p.id,
        createdByName: previous?.createdByName ?? p.name,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        version: (previous?.version ?? 0) + 1,
      };
      const client = data.clients.find((c) => c.id === order.clientId);
      if (!client) throw new Error("Selecciona un cliente válido.");
      order.clientName = client.name;
      if (p.role === "worker") {
        order.laborRate = previous?.laborRate ?? data.company.laborRate;
        order.vatRate = previous?.vatRate ?? data.company.defaultVat;
        order.items = order.items.map((i) => ({
          ...i,
          unitPrice:
            previous?.items.find((old) => old.id === i.id)?.unitPrice ?? 0,
        }));
      }
      data.orders = previous
        ? data.orders.map((o) => (o.id === order.id ? order : o))
        : [order, ...data.orders];
      const changedFields = previous
        ? Object.keys(draft).filter(
            (key) =>
              ![
                "version",
                "updatedAt",
                "createdAt",
                "createdBy",
                "createdByName",
                "number",
              ].includes(key) &&
              JSON.stringify(previous[key as keyof Order]) !==
                JSON.stringify(order[key as keyof Order]),
          )
        : ["title", "description", "locationDetail", "items"];
      addAudit(
        data,
        p,
        order.id,
        previous ? "Parte actualizado" : "Parte creado",
        {
          fields: changedFields,
          before: previous
            ? {
                title: previous.title,
                status: previous.status,
                locationDetail: previous.locationDetail,
              }
            : null,
          after: {
            title: order.title,
            status: order.status,
            locationDetail: order.locationDetail,
          },
        },
      );
      writeData(data);
      notify({ kind: "orders", newOrderId: previous ? undefined : order.id });
      return safeOrder(order, p);
    },
    async saveCompany(company: Company) {
      const p = requireManager(),
        data = readData();
      data.company = structuredClone(company);
      addAudit(data, p, undefined, "Datos de empresa actualizados");
      writeData(data);
      notify({ kind: "settings" });
    },
    async saveClient(client) {
      const p = requireManager(),
        data = readData();
      const exists = data.clients.some((c) => c.id === client.id);
      data.clients = exists
        ? data.clients.map((c) =>
            c.id === client.id ? structuredClone(client) : c,
          )
        : [...data.clients, structuredClone(client)];
      addAudit(
        data,
        p,
        undefined,
        exists ? "Cliente actualizado" : "Cliente creado",
        { name: client.name },
      );
      writeData(data);
      notify({ kind: "settings" });
      return client;
    },
    async setProfileRole(id, role) {
      const p = requireManager(),
        data = readData();
      if (id === p.id && role !== "manager")
        throw new Error("No puedes quitarte tu propio acceso de responsable.");
      const profile = data.profiles.find((q) => q.id === id);
      if (!profile) throw new Error("Usuario no encontrado.");
      profile.role = role;
      addAudit(data, p, undefined, "Rol de usuario actualizado", {
        user: profile.name,
        role,
      });
      writeData(data);
      notify({ kind: "settings" });
    },
    async uploadPhoto(orderId, file) {
      const p = requireProfile(),
        order = readData().orders.find((o) => o.id === orderId);
      if (
        !order ||
        (p.role === "worker" &&
          (order.createdBy !== p.id ||
            ["valued", "sent"].includes(order.status)))
      )
        throw new Error(
          "Guarda primero un parte editable para adjuntar fotos.",
        );
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("No se pudo leer la foto."));
        reader.readAsDataURL(file);
      });
      return {
        id: crypto.randomUUID(),
        path: url,
        url,
        name: file.name,
      } satisfies OrderPhoto;
    },
    async getPhotoUrl(path) {
      return path;
    },
    subscribe(callback) {
      const onChange = (e: Event) =>
        callback((e as CustomEvent<DataEvent>).detail);
      const onStorage = (e: StorageEvent) => {
        if (e.key === DATA_KEY) callback({ kind: "orders" });
        if (e.key === SESSION_KEY) callback({ kind: "auth" });
      };
      window.addEventListener(EVENT_NAME, onChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(EVENT_NAME, onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

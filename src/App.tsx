import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Settings,
  History,
  Plus,
  Search,
  Bell,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Clock3,
  CircleCheck,
  Send,
  SlidersHorizontal,
  Building2,
  FileText,
  Wrench,
  CircleHelp,
  X,
  Download,
  Mail,
  Share2,
  Pencil,
  Check,
  LoaderCircle,
  LogOut,
  AlertCircle,
  Package,
  Camera,
  ShieldCheck,
  Inbox,
  ChevronRight,
  Menu,
} from "lucide-react";
import {
  backendMode,
  repository,
  totals,
  lineTotalCents,
  initialPasswordSetup,
} from "./data";
import type {
  AppData,
  Order,
  OrderStatus,
  Company,
  Client,
  Profile,
  Role,
} from "./types";
import OrderForm from "./OrderForm";
import { Modal, currency, dateLabel, today, errorMessage } from "./ui";

type Page =
  | "dashboard"
  | "orders"
  | "clients"
  | "team"
  | "history"
  | "settings";
const statusMeta: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "Pendiente de valorar", className: "pending" },
  review: { label: "Necesita revisión", className: "review" },
  valued: { label: "Listo para enviar", className: "valued" },
  sent: { label: "Enviado", className: "sent" },
};
const locationMeta = {
  unit: "Unidad / local",
  common: "Zona común",
  exterior: "Exterior",
  other: "Otra ubicación",
};
const navItems = [
  { id: "dashboard", name: "Resumen", icon: LayoutDashboard },
  { id: "orders", name: "Partes de trabajo", icon: ClipboardList },
  { id: "clients", name: "Clientes", icon: Building2 },
  { id: "team", name: "Equipo", icon: Users },
  { id: "history", name: "Historial de actividad", icon: History },
] as const;
function switchDemo(enabled: boolean) {
  const url = new URL(window.location.href);
  url.hash = "";
  if (enabled) url.searchParams.set("demo", "1");
  else url.searchParams.delete("demo");
  window.location.assign(url.toString());
}
function lineAmount(quantity: number, price: number) {
  try {
    return currency(lineTotalCents(quantity, price) / 100);
  } catch {
    return "Revisa el precio";
  }
}
function Badge({ status }: { status: OrderStatus }) {
  const meta = statusMeta[status];
  return (
    <span className={`badge ${meta.className}`}>
      <i />
      {meta.label}
    </span>
  );
}
function Initials({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span className={`avatar ${className}`}>
      {name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [data, setData] = useState<AppData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [page, setPage] = useState<Page>("dashboard"),
    [status, setStatus] = useState<OrderStatus | "all">("all"),
    [search, setSearch] = useState(""),
    [period, setPeriod] = useState("all"),
    [clientFilter, setClientFilter] = useState("all"),
    [urgentOnly, setUrgentOnly] = useState(false),
    [filterOpen, setFilterOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false),
    [editing, setEditing] = useState<Order | undefined>(),
    [selected, setSelected] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [notifications, setNotifications] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [recovery, setRecovery] = useState(initialPasswordSetup),
    [help, setHelp] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await repository.load();
      setData(result);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    let active = true;
    repository
      .getSession()
      .then(async (user) => {
        if (active) {
          setProfile(user);
          if (user) await refresh();
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = repository.subscribe((event) => {
      if (event.kind === "recovery") setRecovery(true);
      if (event.kind === "auth" || event.kind === "recovery") {
        repository
          .getSession()
          .then((user) => {
            if (active) {
              setProfile(user);
              if (user) refresh();
              else setData(null);
            }
          })
          .catch((e) => {
            if (active) setError(errorMessage(e));
          });
      } else {
        refresh();
        if (event.newOrderId)
          setNotice("Ha llegado un nuevo parte de trabajo.");
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  const manager = profile?.role === "manager";
  const openOrders = (filter: OrderStatus | "all") => {
    setStatus(filter);
    setPage("orders");
    setSearch("");
  };
  const changeRole = async (role: Role) => {
    try {
      setSelected(null);
      setMobileNav(false);
      setPage("dashboard");
      setProfile(await repository.selectDemoProfile(role));
      await refresh();
      setNotice(
        role === "worker"
          ? "Vista de operario de ejemplo"
          : "Vista de responsable de ejemplo",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const saved = async (order: Order) => {
    setNewOpen(false);
    setEditing(undefined);
    await refresh();
    setSelected(order.id);
    setNotice("Parte guardado. El responsable podrá revisarlo.");
  };
  if (loading)
    return (
      <div className="boot">
        <div className="brand-mark">
          <Wrench size={28} />
        </div>
        <h2>Orquivia</h2>
        <LoaderCircle className="spin" />
        <p>Preparando tus trabajos…</p>
      </div>
    );
  if (!profile)
    return (
      <>
        <Login
          onLogged={async (user) => {
            setProfile(user);
            await refresh();
          }}
          error={error}
        />
        {recovery && (
          <PasswordRecovery
            onClose={() => setRecovery(false)}
            onSaved={() => setRecovery(false)}
          />
        )}
      </>
    );
  if (!data)
    return (
      <>
        <div className="boot">
          <AlertCircle size={32} />
          <h2>No se han podido cargar los datos</h2>
          <p>
            {error ||
              "Comprueba la conexión con Supabase y la configuración de la base de datos."}
          </p>
          <button className="button primary" onClick={refresh}>
            Volver a intentar
          </button>
          <button
            className="button secondary"
            onClick={() => repository.logout()}
          >
            Cerrar sesión
          </button>
        </div>
        {recovery && (
          <PasswordRecovery
            onClose={() => setRecovery(false)}
            onSaved={() => {
              setRecovery(false);
              void refresh();
            }}
          />
        )}
      </>
    );
  const pending = data.orders.filter(
      (o) => o.status === "pending" || o.status === "review",
    ),
    ready = data.orders.filter((o) => o.status === "valued"),
    sent = data.orders.filter((o) => o.status === "sent");
  const filtered = data.orders.filter((o) => {
    const text =
      `${o.number} ${o.title} ${o.clientName} ${o.site} ${o.locationDetail} ${o.createdByName}`.toLocaleLowerCase(
        "es",
      );
    const date = new Date(o.serviceDate + "T12:00:00");
    const now = new Date(today() + "T12:00:00");
    const days = (now.getTime() - date.getTime()) / 86400000;
    return (
      (status === "all" ||
        o.status === status ||
        (status === "pending" && o.status === "review")) &&
      (!search || text.includes(search.toLocaleLowerCase("es"))) &&
      (clientFilter === "all" || o.clientId === clientFilter) &&
      (!urgentOnly || o.priority === "urgent") &&
      (period === "all" ||
        (period === "today"
          ? o.serviceDate === today()
          : days >= 0 && days < Number(period)))
    );
  });
  const current = data.orders.find((o) => o.id === selected);
  const activeFilters = clientFilter !== "all" || urgentOnly;
  const changePage = (value: Page) => {
    setPage(value);
    setMobileNav(false);
    setStatus("all");
    setSearch("");
  };
  return (
    <div className="app-layout">
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changePage("dashboard");
          }}
        >
          <div className="brand-mark">
            <Wrench size={23} />
          </div>
          <div>
            orquivia<span>CONTROL DE TRABAJOS</span>
          </div>
        </a>
        <div className="workspace-chip">
          <Building2 size={17} />
          <div>
            <strong>{data.company.name}</strong>
            <span>Mantenimiento y reformas</span>
          </div>
          <ShieldCheck size={15} />
        </div>
        <span className="nav-label">ESPACIO DE TRABAJO</span>
        <nav>
          {navItems
            .filter(
              (n) => manager || !["clients", "team", "history"].includes(n.id),
            )
            .map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => changePage(n.id)}
              >
                <n.icon size={19} />
                <span>{n.name}</span>
                {n.id === "orders" && pending.length > 0 && (
                  <b>{pending.length}</b>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div>
              <CircleHelp size={20} />
              <strong>Todo empieza con un parte.</strong>
            </div>
            <p>
              Registra el trabajo en el momento.
              <br />
              Nos ocupamos del resto.
            </p>
            <button onClick={() => setHelp(true)}>
              Cómo funciona
              <ArrowUpRight size={15} />
            </button>
          </div>
          {manager && (
            <button
              className={`settings-nav ${page === "settings" ? "active" : ""}`}
              onClick={() => changePage("settings")}
            >
              <Settings size={19} />
              Configuración
            </button>
          )}
          <div className="user-panel">
            <Initials name={profile.name} />
            <div>
              <strong>{profile.name}</strong>
              <span>
                {manager ? "Responsable" : "Operario"}
                {backendMode === "demo" ? " · Demo" : ""}
              </span>
            </div>
            {backendMode === "demo" ? (
              <select
                aria-label="Cambiar rol de demostración"
                value={profile.role}
                onChange={(e) => changeRole(e.target.value as Role)}
              >
                <option value="manager">Responsable</option>
                <option value="worker">Operario</option>
              </select>
            ) : (
              <button
                className="icon-button"
                aria-label="Cerrar sesión"
                onClick={() => repository.logout()}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir navegación"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={22} />
            </button>
            <span>Espacio de trabajo</span>
            <ChevronRight size={15} />
            <strong>
              {page === "settings"
                ? "Configuración"
                : navItems.find((n) => n.id === page)?.name}
            </strong>
          </div>
          <div className="topbar-actions">
            {backendMode === "demo" ? (
              <>
                <span className="demo-label">
                  <span />
                  Modo demostración
                </span>
                <button className="text-link" onClick={() => switchDemo(false)}>
                  Acceso de empresa
                </button>
              </>
            ) : (
              <span className="connected-label">
                <span />
                Conectado a Supabase
              </span>
            )}
            <button
              className={`icon-button bell-button ${notifications ? "selected" : ""}`}
              aria-label="Ver avisos"
              onClick={() => setNotifications((v) => !v)}
            >
              <Bell size={20} />
              {pending.length > 0 && <i />}
            </button>
            <Initials name={profile.name} className="small" />
          </div>
          {notifications && (
            <div className="notifications-popover">
              <h3>
                Avisos del trabajo<span>{pending.length}</span>
              </h3>
              <p>Se actualizan mientras tienes la aplicación abierta.</p>
              {pending.length === 0 ? (
                <div className="empty-small">
                  Estás al día. No hay partes pendientes.
                </div>
              ) : (
                pending.slice(0, 5).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setSelected(o.id);
                      setNotifications(false);
                    }}
                  >
                    <span className="notif-dot" />
                    <div>
                      <strong>{o.title}</strong>
                      <span>
                        {o.createdByName} · {o.locationDetail}
                      </span>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))
              )}
            </div>
          )}
        </header>
        <main className="main-content">
          {error && (
            <div className="error-box inline-error" role="alert">
              {error}
              <button onClick={refresh}>Reintentar</button>
            </div>
          )}
          {(page === "dashboard" || page === "orders") && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {page === "dashboard"
                      ? "EL TRABAJO, BAJO CONTROL"
                      : "DEL RECINTO A TU BANDEJA"}
                  </div>
                  <h1>
                    {page === "dashboard"
                      ? manager
                        ? "Un vistazo a tus trabajos"
                        : "Tus trabajos, al día"
                      : "Partes de trabajo"}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {manager
                      ? "Cada intervención registrada. Cada albarán, a un paso."
                      : "Cuéntanos qué has hecho. El responsable se ocupa de los precios."}
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setNewOpen(true)}
                >
                  <Plus size={19} />
                  Nuevo parte
                </button>
              </div>
              {page === "dashboard" && (
                <>
                  <section
                    className="summary-grid"
                    aria-label="Resumen de trabajos"
                  >
                    <button
                      className="metric"
                      onClick={() => openOrders("all")}
                    >
                      <div>
                        <span>Partes registrados</span>
                        <ClipboardList size={19} />
                      </div>
                      <strong>
                        {data.orders.length.toString().padStart(2, "0")}
                      </strong>
                      <footer>
                        <span>Todos tus trabajos</span>
                        <ArrowUpRight size={17} />
                      </footer>
                    </button>
                    <button
                      className="metric pending-metric"
                      onClick={() => openOrders("pending")}
                    >
                      <div>
                        <span>Pendientes de valorar</span>
                        <Clock3 size={19} />
                      </div>
                      <strong>
                        {pending.length.toString().padStart(2, "0")}
                        <small>Requieren atención</small>
                      </strong>
                      <footer>
                        <span>
                          {
                            data.orders.filter(
                              (o) =>
                                o.priority === "urgent" &&
                                ["pending", "review"].includes(o.status),
                            ).length
                          }{" "}
                          marcados como urgentes
                        </span>
                        <ArrowUpRight size={17} />
                      </footer>
                    </button>
                    <button
                      className="metric"
                      onClick={() => openOrders("valued")}
                    >
                      <div>
                        <span>Listos para enviar</span>
                        <CircleCheck size={19} />
                      </div>
                      <strong>
                        {ready.length.toString().padStart(2, "0")}
                      </strong>
                      <footer>
                        <span>Precios revisados</span>
                        <ArrowUpRight size={17} />
                      </footer>
                    </button>
                    <button
                      className="metric"
                      onClick={() => openOrders("sent")}
                    >
                      <div>
                        <span>Albaranes enviados</span>
                        <Send size={18} />
                      </div>
                      <strong>{sent.length.toString().padStart(2, "0")}</strong>
                      <footer>
                        <span>
                          {manager
                            ? `${currency(sent.reduce((sum, o) => sum + totals(o).total, 0))} en total`
                            : "Envío confirmado"}
                        </span>
                        <ArrowUpRight size={17} />
                      </footer>
                    </button>
                  </section>
                  {pending.length > 0 && manager && (
                    <div className="attention-strip">
                      <div className="attention-icon">
                        <Inbox size={20} />
                      </div>
                      <div>
                        <strong>
                          Hay {pending.length}{" "}
                          {pending.length === 1
                            ? "trabajo pendiente"
                            : "trabajos pendientes"}{" "}
                          de revisar.
                        </strong>
                        <span>
                          Los operarios ya han registrado los detalles. Tú pones
                          el siguiente paso.
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setStatus("all");
                          setPage("orders");
                          setSelected(pending[0].id);
                        }}
                      >
                        Revisar trabajos
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  )}
                </>
              )}
              <div
                className={`dashboard-grid ${page === "orders" ? "full-grid" : ""}`}
              >
                <section className="work-panel">
                  <div className="panel-title">
                    <div>
                      <h2>
                        {page === "dashboard"
                          ? "Últimos partes"
                          : "Todos los partes"}
                        <span>{data.orders.length}</span>
                      </h2>
                      <p>
                        {manager
                          ? "Lo que sucede en el recinto, en un solo lugar."
                          : "Tu registro de las intervenciones realizadas."}
                      </p>
                    </div>
                    <div className="period-select">
                      <Clock3 size={15} />
                      <select
                        aria-label="Periodo de los trabajos"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                      >
                        <option value="all">Todo el periodo</option>
                        <option value="today">Hoy</option>
                        <option value="7">Últimos 7 días</option>
                        <option value="30">Últimos 30 días</option>
                      </select>
                      <ChevronDown size={14} />
                    </div>
                  </div>
                  <div
                    className="filter-tabs"
                    role="tablist"
                    aria-label="Filtrar por estado"
                  >
                    {(
                      [
                        { value: "all", label: "Todos" },
                        { value: "pending", label: "Pendientes" },
                        { value: "review", label: "Por revisar" },
                        { value: "valued", label: "Listos" },
                        { value: "sent", label: "Enviados" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.value}
                        role="tab"
                        aria-selected={status === tab.value}
                        className={status === tab.value ? "active" : ""}
                        onClick={() => setStatus(tab.value)}
                      >
                        {tab.label}
                        {tab.value === "pending" && (
                          <span>{pending.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="search-row">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        aria-label="Buscar partes"
                        placeholder="Buscar por trabajo, ubicación o número…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <button
                          aria-label="Borrar búsqueda"
                          onClick={() => setSearch("")}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <button
                      className={`button filter-button ${activeFilters ? "active" : ""}`}
                      onClick={() => setFilterOpen(true)}
                    >
                      <SlidersHorizontal size={17} />
                      Filtros{activeFilters && <i />}
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="orders-table">
                      <thead>
                        <tr>
                          <th>TRABAJO / CLIENTE</th>
                          <th>UBICACIÓN</th>
                          <th>ESTADO</th>
                          <th>FECHA</th>
                          <th aria-label="Abrir parte" />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered
                          .slice(0, page === "dashboard" ? 6 : undefined)
                          .map((o) => (
                            <tr key={o.id}>
                              <td>
                                <button
                                  className="job-link"
                                  onClick={() => setSelected(o.id)}
                                >
                                  <span className="order-number">
                                    {o.number}
                                    {o.priority === "urgent" && (
                                      <span className="urgent-tag">
                                        URGENTE
                                      </span>
                                    )}
                                    {o.assistance && (
                                      <CircleHelp
                                        className="help-dot"
                                        size={14}
                                      />
                                    )}
                                  </span>
                                  <strong>{o.title}</strong>
                                  <span className="job-client">
                                    {o.clientName}
                                  </span>
                                  <span className="job-mobile-details">
                                    <span>
                                      <MapPin size={13} />
                                      {o.locationDetail}
                                    </span>
                                    <Badge status={o.status} />
                                  </span>
                                </button>
                              </td>
                              <td>
                                <div className="table-location">
                                  <MapPin size={15} />
                                  <span>
                                    {o.locationDetail}
                                    <small>
                                      {locationMeta[o.locationType]}
                                    </small>
                                  </span>
                                </div>
                              </td>
                              <td>
                                <Badge status={o.status} />
                              </td>
                              <td>
                                <span className="table-date">
                                  {dateLabel(o.serviceDate)}
                                </span>
                                <span className="table-author">
                                  {o.createdByName.split(" ")[0]}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="row-arrow"
                                  aria-label={`Abrir ${o.number}`}
                                  onClick={() => setSelected(o.id)}
                                >
                                  <ChevronRight size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {filtered.length === 0 && (
                    <div className="empty-state">
                      <Search size={30} />
                      <h3>No hay partes con estos filtros</h3>
                      <p>Prueba otra búsqueda o registra tu primer trabajo.</p>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setSearch("");
                          setStatus("all");
                          setPeriod("all");
                          setClientFilter("all");
                          setUrgentOnly(false);
                        }}
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                  <div className="table-footer">
                    <span>
                      {Math.min(
                        filtered.length,
                        page === "dashboard" ? 6 : filtered.length,
                      )}{" "}
                      de {filtered.length} partes
                      {backendMode === "demo" ? " · datos de ejemplo" : ""}
                    </span>
                    {page === "dashboard" ? (
                      <button onClick={() => openOrders("all")}>
                        Ver todos los partes
                        <ArrowRight size={16} />
                      </button>
                    ) : (
                      <span>Ordenados por última actualización</span>
                    )}
                  </div>
                </section>
                {page === "dashboard" && (
                  <aside className="right-column">
                    <section className="activity-panel">
                      <div className="section-title">
                        <h2>Actividad reciente</h2>
                        <span className="live-dot" />
                      </div>
                      <div className="timeline">
                        {data.audit.slice(0, 4).map((entry, i) => (
                          <button
                            key={entry.id}
                            className="timeline-item"
                            disabled={!entry.orderId}
                            onClick={() => setSelected(entry.orderId || null)}
                          >
                            <div className={`timeline-icon tone-${i % 3}`}>
                              {i === 0 ? (
                                <ClipboardList size={14} />
                              ) : i === 1 ? (
                                <CircleCheck size={14} />
                              ) : (
                                <Pencil size={14} />
                              )}
                            </div>
                            <div>
                              <strong>{entry.actorName}</strong>
                              <p>{entry.action}</p>
                              <time>
                                {dateLabel(entry.createdAt)} ·{" "}
                                {new Intl.DateTimeFormat("es-ES", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "Europe/Madrid",
                                }).format(new Date(entry.createdAt))}
                              </time>
                            </div>
                          </button>
                        ))}
                        {!data.audit.length && (
                          <p className="muted">
                            Los cambios registrados aparecerán aquí.
                          </p>
                        )}
                      </div>
                      {manager && (
                        <button
                          className="text-link"
                          onClick={() => changePage("history")}
                        >
                          Ver historial completo
                          <ArrowRight size={15} />
                        </button>
                      )}
                    </section>
                    <section className="flow-card">
                      <div className="flow-illustration">
                        <FileText size={35} />
                        <span>
                          <Check size={14} />
                        </span>
                        <div className="line one" />
                        <div className="line two" />
                      </div>
                      <span className="eyebrow">
                        MENOS PAPELEO, MÁS CONTROL
                      </span>
                      <h3>
                        Del trabajo al albarán.
                        <br />
                        Sin perder un detalle.
                      </h3>
                      <p>
                        Ubicación, materiales y fotos.
                        <br />
                        Todo lo que necesitas para valorar.
                      </p>
                      <button onClick={() => setNewOpen(true)}>
                        Registrar una intervención
                        <ArrowRight size={16} />
                      </button>
                    </section>
                    <div className="security-note">
                      <ShieldCheck size={17} />
                      <span>
                        Cada cambio deja huella.
                        <br />
                        <strong>Sabes quién hizo qué.</strong>
                      </span>
                    </div>
                  </aside>
                )}
              </div>
            </>
          )}
          {page === "clients" && (
            <Clients
              data={data}
              onSaved={async () => {
                await refresh();
                setNotice("Cliente guardado.");
              }}
            />
          )}
          {page === "settings" && (
            <CompanySettings
              company={data.company}
              onSaved={async () => {
                await refresh();
                setNotice("Datos de empresa guardados.");
              }}
            />
          )}
          {page === "team" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">UN EQUIPO, UN MISMO REGISTRO</div>
                  <h1>
                    Tu equipo<span className="heading-dot">.</span>
                  </h1>
                  <p>
                    Un acceso personal para cada persona. Una huella en cada
                    cambio.
                  </p>
                </div>
              </div>
              <div className="team-grid">
                {data.profiles.map((p) => (
                  <div className="team-card" key={p.id}>
                    <Initials name={p.name} />
                    <h3>{p.name}</h3>
                    <p>{p.email || "Perfil de demostración"}</p>
                    <span
                      className={`badge ${p.role === "manager" ? "valued" : "sent"}`}
                    >
                      <i />
                      {p.role === "manager" ? "Responsable" : "Operario"}
                    </span>
                    <footer>
                      {p.role === "manager"
                        ? "Revisa, valora y prepara albaranes."
                        : "Registra y edita sus propios trabajos."}
                    </footer>
                  </div>
                ))}
              </div>
              <div className="info-note">
                <ShieldCheck />
                <div>
                  <strong>Accesos individuales</strong>
                  <p>
                    Los usuarios se dan de alta desde Supabase y reciben el rol
                    correspondiente. La base de datos comprueba los permisos en
                    cada operación.
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "history" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">TRAZABILIDAD DE PRINCIPIO A FIN</div>
                  <h1>
                    Historial de actividad<span className="heading-dot">.</span>
                  </h1>
                  <p>Quién registró el trabajo, qué cambió y cuándo.</p>
                </div>
              </div>
              <section className="history-list">
                {data.audit.map((entry) => (
                  <div key={entry.id}>
                    <Initials name={entry.actorName} />
                    <div>
                      <strong>{entry.actorName}</strong>
                      <p>{entry.action}</p>
                      {entry.changes &&
                        Object.keys(entry.changes).length > 0 && (
                          <details>
                            <summary>Ver cambios registrados</summary>
                            <pre>{JSON.stringify(entry.changes, null, 2)}</pre>
                          </details>
                        )}
                    </div>
                    <time>
                      {dateLabel(entry.createdAt, true)}
                      <small>
                        {new Intl.DateTimeFormat("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Europe/Madrid",
                        }).format(new Date(entry.createdAt))}
                      </small>
                    </time>
                    {entry.orderId && (
                      <button
                        className="icon-button"
                        aria-label="Ver parte relacionado"
                        onClick={() => setSelected(entry.orderId!)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    )}
                  </div>
                ))}
                {!data.audit.length && (
                  <div className="empty-state">
                    <History />
                    <h3>Aún no hay actividad</h3>
                    <p>Los cambios aparecerán aquí al registrar un trabajo.</p>
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>Orquivia · Cada trabajo cuenta.</span>
            <span>
              {backendMode === "demo"
                ? "Vista de ejemplo · guardado solo en este navegador"
                : "Acceso personal · datos protegidos en Supabase"}
            </span>
          </footer>
        </main>
      </div>
      {(newOpen || editing) && (
        <OrderForm
          data={data}
          profile={profile}
          order={editing}
          onClose={() => {
            setNewOpen(false);
            setEditing(undefined);
          }}
          onSaved={saved}
        />
      )}
      {current && (
        <OrderDetail
          key={`${current.id}-${current.version}`}
          order={current}
          data={data}
          profile={profile}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setSelected(null);
            setEditing(current);
          }}
          onSaved={async () => {
            await refresh();
            setNotice("Cambios guardados.");
          }}
          onNotice={setNotice}
        />
      )}
      {filterOpen && (
        <Modal title="Filtrar partes" onClose={() => setFilterOpen(false)}>
          <div className="form-content">
            <label>
              Cliente
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
              >
                <option value="all">Todos los clientes</option>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={urgentOnly}
                onChange={(e) => setUrgentOnly(e.target.checked)}
              />
              Solo trabajos urgentes
            </label>
          </div>
          <footer className="modal-footer">
            <button
              className="button secondary"
              onClick={() => {
                setClientFilter("all");
                setUrgentOnly(false);
              }}
            >
              Limpiar
            </button>
            <button
              className="button primary"
              onClick={() => setFilterOpen(false)}
            >
              Aplicar filtros
            </button>
          </footer>
        </Modal>
      )}
      {recovery && (
        <PasswordRecovery
          onClose={() => setRecovery(false)}
          onSaved={() => {
            setRecovery(false);
            setNotice("Contraseña actualizada.");
          }}
        />
      )}
      {help && (
        <Modal title="Así funciona Orquivia" onClose={() => setHelp(false)}>
          <div className="form-content how-it-works">
            {[
              {
                icon: MapPin,
                title: "1. Registra el trabajo",
                text: "El operario indica cliente, ubicación y descripción. Añade materiales y fotos, o pide ayuda si tiene alguna duda.",
              },
              {
                icon: ClipboardList,
                title: "2. Revisa y pon los precios",
                text: "El responsable recibe el parte en su bandeja. Completa los precios de materiales y horas, y revisa el IVA.",
              },
              {
                icon: Send,
                title: "3. Prepara el albarán",
                text: "Descarga el PDF o compártelo desde el dispositivo. Cuando lo hayas enviado al cliente, confirma el envío en la aplicación.",
              },
            ].map((item) => (
              <div key={item.title}>
                <item.icon />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
            <div className="quiet-note">
              Los avisos funcionan con la aplicación abierta. Para revisar
              novedades, vuelve a la bandeja.
            </div>
          </div>
          <footer className="modal-footer">
            <button className="button primary" onClick={() => setHelp(false)}>
              Entendido
              <Check size={17} />
            </button>
          </footer>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <CircleCheck size={19} />
          {notice}
          <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Login({
  onLogged,
  error: initialError,
}: {
  onLogged: (profile: Profile) => void;
  error: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogged(await repository.login(email, password));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const enterDemo = async (role: Role) => {
    setBusy(true);
    setError("");
    try {
      onLogged(await repository.selectDemoProfile(role));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (backendMode === "demo")
    return (
      <div className="login-page">
        <section className="login-story">
          <div className="brand">
            <div className="brand-mark">
              <Wrench />
            </div>
            <div>
              orquivia<span>CONTROL DE TRABAJOS</span>
            </div>
          </div>
          <div>
            <span className="eyebrow">PRUEBA EL FLUJO COMPLETO</span>
            <h1>
              Del trabajo
              <br />
              al albarán<span>.</span>
            </h1>
            <p>Datos de ejemplo, guardados solo en este navegador.</p>
          </div>
        </section>
        <section className="login-form">
          <div className="login-form-inner">
            <span className="eyebrow">DEMOSTRACIÓN DE ORQUIVIA</span>
            <h2>Elige cómo quieres probar.</h2>
            <p>
              El operario registra; el responsable revisa y pone los precios.
            </p>
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            <button
              className="button primary"
              disabled={busy}
              onClick={() => enterDemo("manager")}
            >
              Responsable demo
              <ArrowRight size={18} />
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => enterDemo("worker")}
            >
              Operario demo
              <ArrowRight size={18} />
            </button>
            <button className="text-link" onClick={() => switchDemo(false)}>
              Ir al acceso de empresa
            </button>
          </div>
        </section>
      </div>
    );
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <div className="brand-mark">
            <Wrench />
          </div>
          <div>
            orquivia<span>CONTROL DE TRABAJOS</span>
          </div>
        </div>
        <div>
          <span className="eyebrow">EL TRABAJO, BAJO CONTROL</span>
          <h1>
            Cada intervención.
            <br />
            Cada detalle.
            <br />
            En un mismo lugar<span>.</span>
          </h1>
          <p>Del recinto a la oficina, sin perder lo importante.</p>
        </div>
        <span>Mantenimiento · Reparaciones · Pequeñas reformas</span>
      </section>
      <section className="login-form">
        <div className="login-form-inner">
          <span className="eyebrow">BIENVENIDO A ORQUIVIA</span>
          <h2>Tu trabajo empieza aquí.</h2>
          <p>Accede con la cuenta que te ha facilitado el responsable.</p>
          <form onSubmit={submit}>
            <label>
              Correo electrónico
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.es"
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            {message && (
              <div role="status" className="success-box">
                {message}
              </div>
            )}
            <button
              className="button primary"
              disabled={busy || backendMode === "invalid"}
            >
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <ArrowRight size={18} />
              )}
              Entrar
            </button>
          </form>
          <button
            className="text-link"
            disabled={busy || backendMode === "invalid"}
            onClick={async () => {
              if (!email) {
                setError(
                  "Escribe tu correo para recibir el enlace de recuperación.",
                );
                return;
              }
              setBusy(true);
              try {
                await repository.resetPassword(email);
                setMessage(
                  "Si el correo tiene una cuenta, recibirás un enlace para recuperar el acceso.",
                );
                setError("");
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            He olvidado mi contraseña
          </button>
          <button
            className="text-link"
            disabled={busy}
            onClick={() => switchDemo(true)}
          >
            Probar demostración
            <ArrowRight size={16} />
          </button>
          <p className="login-foot">
            <ShieldCheck size={16} />
            Acceso privado para el equipo de Orquivia
          </p>
        </div>
      </section>
    </div>
  );
}

function OrderDetail({
  order,
  data,
  profile,
  onClose,
  onEdit,
  onSaved,
  onNotice,
}: {
  order: Order;
  data: AppData;
  profile: Profile;
  onClose: () => void;
  onEdit: () => void;
  onSaved: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const manager = profile.role === "manager",
    [draft, setDraft] = useState(structuredClone(order)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"report" | "price" | "history">("report"),
    [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    Promise.all(
      order.photos.map(
        async (photo) =>
          [
            photo.id,
            photo.url || (await repository.getPhotoUrl(photo.path)),
          ] as const,
      ),
    )
      .then((entries) => {
        if (active) setPhotoUrls(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) setError("No se han podido cargar las fotos.");
      });
    return () => {
      active = false;
    };
  }, [order.photos]);
  const pricing = useMemo(() => {
    try {
      return { amount: totals(draft), error: "" };
    } catch (e) {
      return { amount: totals(order), error: errorMessage(e) };
    }
  }, [draft, order]);
  const amount = pricing.amount;
  const dirty = JSON.stringify(draft) !== JSON.stringify(order);
  const save = async (status?: OrderStatus) => {
    setBusy(true);
    setError("");
    try {
      const next = { ...draft, status: status || draft.status };
      await repository.saveOrder(next, order.version);
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const client = data.clients.find((c) => c.id === order.clientId);
  const exportPdf = async () => {
    try {
      const { downloadDeliveryNote } = await import("./pdf");
      downloadDeliveryNote(order, data.company, client, {
        demo: backendMode === "demo",
      });
      onNotice("PDF descargado. Puedes adjuntarlo al mensaje del cliente.");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const share = async () => {
    try {
      const { generateDeliveryNote, deliveryNoteFilename } = await import(
        "./pdf"
      );
      const file = new File(
        [
          generateDeliveryNote(order, data.company, client, {
            demo: backendMode === "demo",
          }),
        ],
        deliveryNoteFilename(order),
        { type: "application/pdf" },
      );
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Albarán ${order.number}`,
          text: order.title,
        });
        onNotice(
          "PDF compartido. Confirma el envío cuando lo hayas enviado al cliente.",
        );
      } else await exportPdf();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(errorMessage(e));
    }
  };
  const priced = order.status === "valued" || order.status === "sent";
  return (
    <Modal title={order.number} onClose={onClose} wide>
      <div className="detail-heading">
        <div>
          <Badge status={order.status} />
          {order.priority === "urgent" && (
            <span className="urgent-tag">URGENTE</span>
          )}
          <h2>{order.title}</h2>
          <p>
            <Initials name={order.createdByName} className="tiny" />
            Registrado por {order.createdByName} ·{" "}
            {dateLabel(order.createdAt, true)}
          </p>
        </div>
        {(manager ||
          (order.createdBy === profile.id &&
            ["pending", "review"].includes(order.status))) && (
          <button className="button secondary" onClick={onEdit}>
            <Pencil size={16} />
            Editar parte
          </button>
        )}
      </div>
      <div className="detail-tabs">
        <button
          className={tab === "report" ? "active" : ""}
          onClick={() => setTab("report")}
        >
          <FileText size={17} />
          Parte de trabajo
        </button>
        {manager && (
          <button
            className={tab === "price" ? "active" : ""}
            onClick={() => setTab("price")}
          >
            <ClipboardList size={17} />
            Valoración
          </button>
        )}
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          <History size={17} />
          Historial
        </button>
      </div>
      <div className="detail-content">
        {tab === "report" && (
          <>
            <div className="detail-info-grid">
              <div>
                <span>CLIENTE</span>
                <strong>{order.clientName}</strong>
                <small>{order.site}</small>
              </div>
              <div>
                <span>UBICACIÓN</span>
                <strong>
                  <MapPin size={16} />
                  {order.locationDetail}
                </strong>
                <small>{locationMeta[order.locationType]}</small>
              </div>
              <div>
                <span>FECHA DEL TRABAJO</span>
                <strong>{dateLabel(order.serviceDate, true)}</strong>
                <small>{order.hours} horas registradas</small>
              </div>
            </div>
            {order.assistance && (
              <div className="assistance-note">
                <CircleHelp size={23} />
                <div>
                  <strong>El operario necesita una revisión</strong>
                  <p>{order.assistanceNote}</p>
                </div>
              </div>
            )}
            <section className="detail-section">
              <h3>Descripción del trabajo</h3>
              <p className="preserve-lines">{order.description}</p>
            </section>
            <section className="detail-section">
              <h3>
                <Package size={18} />
                Materiales registrados
              </h3>
              {order.items.length ? (
                <div className="material-list">
                  {order.items.map((item) => (
                    <div key={item.id}>
                      <span>{item.description}</span>
                      <strong>
                        {item.quantity} {item.unit}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No se han registrado materiales.</p>
              )}
            </section>
            {order.photos.length > 0 && (
              <section className="detail-section">
                <h3>
                  <CameraIcon />
                  Fotos del trabajo
                </h3>
                <div className="photos-grid">
                  {order.photos.map((p) => (
                    <a
                      key={p.id}
                      href={photoUrls[p.id]}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {photoUrls[p.id] ? (
                        <img src={photoUrls[p.id]} alt={p.name} />
                      ) : (
                        <LoaderCircle className="spin" />
                      )}
                    </a>
                  ))}
                </div>
              </section>
            )}
            {order.notes && (
              <section className="detail-section">
                <h3>Observaciones</h3>
                <p className="preserve-lines">{order.notes}</p>
              </section>
            )}
          </>
        )}
        {tab === "price" && manager && (
          <>
            <div className="form-intro">
              <ClipboardList />
              <div>
                <h3>Completa los precios</h3>
                <p>Los importes y el IVA se calculan automáticamente.</p>
              </div>
            </div>
            <div className="pricing-table">
              <div className="pricing-head">
                <span>MATERIAL / CONCEPTO</span>
                <span>CANTIDAD</span>
                <span>PRECIO UNITARIO</span>
                <span>IMPORTE</span>
              </div>
              {draft.items.map((item) => (
                <div className="pricing-row" key={item.id}>
                  <strong>{item.description}</strong>
                  <span>
                    {item.quantity} {item.unit}
                  </span>
                  <label className="price-input">
                    <input
                      aria-label={`Precio de ${item.description}`}
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          items: d.items.map((i) =>
                            i.id === item.id
                              ? { ...i, unitPrice: Number(e.target.value) }
                              : i,
                          ),
                        }))
                      }
                    />
                    <span>€</span>
                  </label>
                  <strong>{lineAmount(item.quantity, item.unitPrice)}</strong>
                </div>
              ))}
            </div>
            <div className="field-grid price-fields">
              <label>
                Horas de trabajo
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={draft.hours}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, hours: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                Precio por hora (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.laborRate}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      laborRate: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                IVA (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.vatRate}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, vatRate: Number(e.target.value) }))
                  }
                />
                <small>Confirma el tipo aplicable a este trabajo.</small>
              </label>
            </div>
            <label className="check-line">
              <input
                type="checkbox"
                checked={draft.assistance}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, assistance: e.target.checked }))
                }
              />
              La revisión solicitada sigue pendiente
            </label>
            {pricing.error && (
              <div className="error-box" role="alert">
                {pricing.error}
              </div>
            )}
            <div className="totals-card">
              <div>
                <span>Materiales</span>
                <strong>{currency(amount.materials)}</strong>
              </div>
              <div>
                <span>Mano de obra</span>
                <strong>{currency(amount.labor)}</strong>
              </div>
              <div>
                <span>Base imponible</span>
                <strong>{currency(amount.subtotal)}</strong>
              </div>
              <div>
                <span>IVA ({draft.vatRate} %)</span>
                <strong>{currency(amount.vat)}</strong>
              </div>
              <div className="total-line">
                <span>Total albarán</span>
                <strong>{currency(amount.total)}</strong>
              </div>
            </div>
            <div className="quiet-note">
              <ShieldCheck size={17} />
              Los cambios de precios y estado quedan registrados en el
              historial.
            </div>
          </>
        )}
        {tab === "history" && (
          <div className="order-history">
            {data.audit
              .filter((a) => a.orderId === order.id)
              .map((a) => (
                <div key={a.id}>
                  <span className="history-dot" />
                  <div>
                    <strong>{a.actorName}</strong>
                    <p>{a.action}</p>
                    <time>{dateLabel(a.createdAt, true)}</time>
                    {a.changes && (
                      <details>
                        <summary>Detalle de cambios</summary>
                        <pre>{JSON.stringify(a.changes, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            {!data.audit.some((a) => a.orderId === order.id) && (
              <p className="muted">Sin cambios adicionales registrados.</p>
            )}
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
      </div>
      <footer className="detail-footer">
        {manager ? (
          <>
            {priced && (
              <div className="delivery-actions">
                <button
                  className="button secondary"
                  disabled={busy || dirty}
                  onClick={exportPdf}
                >
                  <Download size={16} />
                  PDF
                </button>
                <button
                  className="button secondary"
                  disabled={busy || dirty}
                  onClick={share}
                >
                  <Share2 size={16} />
                  Compartir
                </button>
                {client?.email && (
                  <a
                    className="button secondary"
                    href={`mailto:${client.email}?subject=${encodeURIComponent(`Albarán ${order.number} · ${data.company.name}`)}&body=${encodeURIComponent(`Hola,\n\nAdjunto el albarán ${order.number} correspondiente a ${order.title}, en ${order.locationDetail}.\n\nUn saludo,\n${data.company.name}\n\nRecuerda adjuntar el PDF descargado antes de enviar este mensaje.`)}`}
                    onClick={() =>
                      onNotice(
                        "Adjunta el PDF descargado al correo antes de enviarlo.",
                      )
                    }
                  >
                    <Mail size={16} />
                    Correo
                  </a>
                )}
              </div>
            )}
            <div className="detail-primary-actions">
              {tab === "price" ? (
                <>
                  <button
                    className="button secondary"
                    disabled={busy || !dirty || Boolean(pricing.error)}
                    onClick={() => save()}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                    Guardar cambios
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy || draft.assistance || Boolean(pricing.error)
                    }
                    title={
                      draft.assistance
                        ? "Resuelve primero la revisión solicitada"
                        : ""
                    }
                    onClick={() => save("valued")}
                  >
                    <CircleCheck size={17} />
                    Dejar listo para enviar
                  </button>
                </>
              ) : priced ? (
                <>
                  {order.status !== "sent" && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => save("sent")}
                    >
                      <Check size={17} />
                      Confirmar que lo he enviado
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="button primary"
                  onClick={() => setTab("price")}
                >
                  Valorar trabajo
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
            {dirty && tab !== "price" && (
              <small>
                Guarda los cambios en Valoración para preparar el PDF.
              </small>
            )}
          </>
        ) : (
          <span className="muted">
            El responsable revisará este parte y preparará el albarán.
          </span>
        )}
      </footer>
    </Modal>
  );
}
function CameraIcon() {
  return <Camera size={18} />;
}

function CompanySettings({
  company,
  onSaved,
}: {
  company: Company;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(company),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await repository.saveCompany(draft);
      await onSaved();
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOS DATOS QUE ACOMPAÑAN TU TRABAJO</div>
          <h1>
            Configuración<span className="heading-dot">.</span>
          </h1>
          <p>
            Estos datos aparecen en los albaranes que preparas para tus
            clientes.
          </p>
        </div>
      </div>
      <form className="settings-card" onSubmit={save}>
        <div className="section-title">
          <h2>
            <Building2 size={20} />
            Datos de empresa
          </h2>
          <span className="badge sent">
            <i />
            Solo responsable
          </span>
        </div>
        <div className="field-grid">
          <label>
            Nombre / razón social
            <input
              required
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </label>
          <label>
            NIF / CIF
            <input
              value={draft.taxId}
              onChange={(e) =>
                setDraft((d) => ({ ...d, taxId: e.target.value }))
              }
              placeholder="Pendiente de completar"
            />
          </label>
          <label>
            Correo electrónico
            <input
              type="email"
              value={draft.email}
              onChange={(e) =>
                setDraft((d) => ({ ...d, email: e.target.value }))
              }
            />
          </label>
          <label>
            Teléfono
            <input
              type="tel"
              value={draft.phone}
              onChange={(e) =>
                setDraft((d) => ({ ...d, phone: e.target.value }))
              }
            />
          </label>
        </div>
        <label>
          Dirección fiscal
          <input
            value={draft.address}
            onChange={(e) =>
              setDraft((d) => ({ ...d, address: e.target.value }))
            }
          />
        </label>
        <div className="section-title separated">
          <h2>
            <ClipboardList size={20} />
            Valores habituales
          </h2>
        </div>
        <div className="field-grid">
          <label>
            IVA por defecto (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={draft.defaultVat}
              onChange={(e) =>
                setDraft((d) => ({ ...d, defaultVat: Number(e.target.value) }))
              }
            />
            <small>
              Editable en cada albarán. Verifica el tipo que corresponde.
            </small>
          </label>
          <label>
            Precio habitual por hora (€)
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.laborRate}
              onChange={(e) =>
                setDraft((d) => ({ ...d, laborRate: Number(e.target.value) }))
              }
            />
            <small>Se propone automáticamente en los nuevos partes.</small>
          </label>
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <footer>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            Guardar configuración
          </button>
        </footer>
      </form>
    </>
  );
}
function Clients({
  data,
  onSaved,
}: {
  data: AppData;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Client | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await repository.saveClient(editing);
      await onSaved();
      setEditing(null);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CADA RECINTO, BIEN IDENTIFICADO</div>
          <h1>
            Clientes<span className="heading-dot">.</span>
          </h1>
          <p>
            Los datos del cliente y su centro, disponibles para todo el equipo.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setError("");
            setEditing({
              id: crypto.randomUUID(),
              name: "",
              taxId: "",
              email: "",
              phone: "",
              address: "",
              site: "",
            });
          }}
        >
          <Plus size={18} />
          Nuevo cliente
        </button>
      </div>
      <div className="clients-grid">
        {data.clients.map((c) => (
          <article className="client-card" key={c.id}>
            <div className="client-icon">
              <Building2 size={23} />
            </div>
            <h3>{c.name}</h3>
            <p>
              <MapPin size={15} />
              {c.site || "Recinto pendiente"}
            </p>
            <div>
              <span>{c.taxId || "NIF pendiente de completar"}</span>
              <span>{c.email || "Sin correo de contacto"}</span>
            </div>
            <footer>
              <span>
                {data.orders.filter((o) => o.clientId === c.id).length} partes
                registrados
              </span>
              <button
                aria-label={`Editar ${c.name}`}
                onClick={() => {
                  setError("");
                  setEditing({ ...c });
                }}
              >
                <Pencil size={16} />
              </button>
            </footer>
          </article>
        ))}
      </div>
      {!data.clients.length && (
        <div className="empty-state">
          <Building2 size={30} />
          <h3>Añade tu primer cliente</h3>
          <p>El equipo podrá seleccionarlo al registrar un trabajo.</p>
        </div>
      )}
      {editing && (
        <Modal
          title={
            data.clients.some((c) => c.id === editing.id)
              ? "Editar cliente"
              : "Nuevo cliente"
          }
          onClose={() => setEditing(null)}
        >
          <form onSubmit={submit}>
            <div className="form-content">
              <label>
                Nombre / razón social
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label>
                Centro / recinto habitual
                <input
                  required
                  value={editing.site}
                  onChange={(e) =>
                    setEditing({ ...editing, site: e.target.value })
                  }
                />
              </label>
              <div className="field-grid">
                <label>
                  NIF / CIF
                  <input
                    value={editing.taxId}
                    onChange={(e) =>
                      setEditing({ ...editing, taxId: e.target.value })
                    }
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    type="tel"
                    value={editing.phone}
                    onChange={(e) =>
                      setEditing({ ...editing, phone: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Correo de contacto
                <input
                  type="email"
                  value={editing.email}
                  onChange={(e) =>
                    setEditing({ ...editing, email: e.target.value })
                  }
                />
              </label>
              <label>
                Dirección fiscal
                <input
                  value={editing.address}
                  onChange={(e) =>
                    setEditing({ ...editing, address: e.target.value })
                  }
                />
              </label>
              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Check size={17} />
                )}
                Guardar cliente
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
function PasswordRecovery({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Recuperar el acceso" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await repository.updatePassword(password);
            onSaved();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-content">
          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>Usa al menos 10 caracteres.</small>
          </label>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <button className="button primary" disabled={busy}>
            Actualizar contraseña
          </button>
        </footer>
      </form>
    </Modal>
  );
}

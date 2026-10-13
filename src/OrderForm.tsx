import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  MapPin,
  Hammer,
  Package,
  CircleHelp,
  Camera,
  LoaderCircle,
  Save,
} from "lucide-react";
import type { AppData, Order, OrderDraft, Profile } from "./types";
import { repository } from "./data";
import { Modal, today, errorMessage } from "./ui";

const locationOptions = [
  { value: "unit", label: "Unidad / local" },
  { value: "common", label: "Zona común" },
  { value: "exterior", label: "Exterior / perímetro" },
  { value: "other", label: "Otra ubicación" },
] as const;
export default function OrderForm({
  data,
  profile,
  order,
  onClose,
  onSaved,
}: {
  data: AppData;
  profile: Profile;
  order?: Order;
  onClose: () => void;
  onSaved: (order: Order) => void;
}) {
  const draftKey = `orquivia-draft-${profile.id}-${order?.id || "new"}`;
  const [initial] = useState<{ draft: OrderDraft; stale: boolean }>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const restored = JSON.parse(saved) as OrderDraft;
        if (order && restored.version !== order.version)
          return { draft: structuredClone(order), stale: true };
        if (
          restored &&
          typeof restored.title === "string" &&
          Array.isArray(restored.items) &&
          Array.isArray(restored.photos)
        )
          return { draft: restored, stale: false };
      }
    } catch {
      /* Local storage unavailable or invalid draft */
    }
    return {
      draft: order
        ? structuredClone(order)
        : {
            id: crypto.randomUUID(),
            title: "",
            description: "",
            clientId: data.clients[0]?.id || "",
            clientName: data.clients[0]?.name || "",
            site: data.clients[0]?.site || "",
            locationType: "unit",
            locationDetail: "",
            priority: "normal",
            status: "pending",
            serviceDate: today(),
            hours: 0,
            laborRate: data.company.laborRate,
            vatRate: data.company.defaultVat,
            items: [],
            notes: "",
            assistance: false,
            assistanceNote: "",
            photos: [],
          },
      stale: false,
    };
  });
  const [draft, setDraft] = useState(initial.draft);
  const [step, setStep] = useState(0),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      initial.stale
        ? "El parte cambió desde que guardaste el borrador. Se ha cargado la última versión para que revises los datos."
        : "",
    );
  const [savedVersion, setSavedVersion] = useState<number | undefined>(
    initial.draft.version ?? order?.version,
  );
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* Storage restricted */
    }
  }, [draft, draftKey]);
  const patch = (value: Partial<OrderDraft>) =>
    setDraft((prev) => ({ ...prev, ...value }));
  const next = () => {
    if (
      step === 0 &&
      (!draft.clientId ||
        !draft.site.trim() ||
        !draft.locationDetail.trim() ||
        !draft.serviceDate)
    ) {
      setError("Indica el cliente, el recinto, la ubicación y la fecha.");
      return;
    }
    if (step === 1 && (!draft.title.trim() || !draft.description.trim())) {
      setError("Añade un título y explica el trabajo realizado o solicitado.");
      return;
    }
    setError("");
    setStep((prev) => prev + 1);
  };
  const submit = async () => {
    if (draft.items.some((i) => !i.description.trim() || i.quantity <= 0)) {
      setError(
        "Revisa los materiales: necesitan descripción y una cantidad mayor que cero.",
      );
      return;
    }
    if (draft.assistance && !draft.assistanceNote.trim()) {
      setError("Explica qué necesitas que revise el responsable.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await repository.saveOrder(
        {
          ...draft,
          status: order?.status || (draft.assistance ? "review" : "pending"),
        },
        savedVersion,
      );
      setSavedVersion(saved.version);
      setDraft(saved);
      let final = saved;
      if (files.length) {
        const photos = [...saved.photos];
        for (const file of files) {
          photos.push(await repository.uploadPhoto(saved.id, file));
          setDraft({ ...saved, photos: [...photos] });
          setFiles((remaining) =>
            remaining.filter((pending) => pending !== file),
          );
        }
        final = await repository.saveOrder({ ...saved, photos }, saved.version);
        setSavedVersion(final.version);
        setDraft(final);
      }
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* A server save does not depend on browser storage. */
      }
      onSaved(final);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={order ? "Editar parte de trabajo" : "Nuevo parte de trabajo"}
      onClose={onClose}
      wide
    >
      <div className="steps">
        {["Dónde", "Qué trabajo", "Materiales y fotos"].map((label, i) => (
          <div
            key={label}
            className={`step ${i === step ? "active" : ""} ${i < step ? "complete" : ""}`}
          >
            <span>{i < step ? <Check size={16} /> : i + 1}</span>
            {label}
          </div>
        ))}
      </div>
      <div className="form-content">
        {step === 0 && (
          <>
            <div className="form-intro">
              <MapPin />
              <div>
                <h3>Empecemos por la ubicación</h3>
                <p>Indica exactamente dónde está el trabajo.</p>
              </div>
            </div>
            <div className="field-grid">
              <label>
                Cliente
                <select
                  value={draft.clientId}
                  onChange={(e) => {
                    const client = data.clients.find(
                      (c) => c.id === e.target.value,
                    );
                    patch({
                      clientId: client?.id || "",
                      clientName: client?.name || "",
                      site: client?.site || "",
                    });
                  }}
                >
                  <option value="">Selecciona un cliente</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha del trabajo
                <input
                  type="date"
                  required
                  value={draft.serviceDate}
                  onChange={(e) => patch({ serviceDate: e.target.value })}
                />
              </label>
            </div>
            <label>
              Centro / recinto
              <input
                value={draft.site}
                onChange={(e) => patch({ site: e.target.value })}
                placeholder="Ej. Centro comercial Las Terrazas"
              />
            </label>
            <label>Tipo de ubicación</label>
            <div className="location-options">
              {locationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={draft.locationType === opt.value ? "selected" : ""}
                  onClick={() => patch({ locationType: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label>
              Ubicación concreta
              <input
                autoComplete="off"
                value={draft.locationDetail}
                onChange={(e) => patch({ locationDetail: e.target.value })}
                placeholder={
                  draft.locationType === "unit"
                    ? "Ej. Unidad 12 · planta baja"
                    : "Ej. Acceso sur · junto a la fuente"
                }
              />
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={draft.priority === "urgent"}
                onChange={(e) =>
                  patch({ priority: e.target.checked ? "urgent" : "normal" })
                }
              />
              <span>
                Es urgente
                <small>
                  Destacar este trabajo en la bandeja del responsable.
                </small>
              </span>
            </label>
          </>
        )}
        {step === 1 && (
          <>
            <div className="form-intro">
              <Hammer />
              <div>
                <h3>Cuéntanos qué se necesita</h3>
                <p>Con tus palabras. Lo importante es que quede registrado.</p>
              </div>
            </div>
            <label>
              Título del trabajo
              <input
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={160}
                placeholder="Ej. Reparar falso techo en la unidad 12"
              />
            </label>
            <label>
              Descripción del trabajo
              <textarea
                rows={5}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="¿Qué se ha pedido? ¿Qué has hecho? ¿Qué queda pendiente?"
              />
            </label>
            <label>
              Tiempo de trabajo (horas)
              <input
                type="number"
                min="0"
                max="10000"
                step="0.25"
                value={draft.hours || ""}
                onChange={(e) =>
                  patch({ hours: Math.max(0, Number(e.target.value)) })
                }
                placeholder="Ej. 1,5"
              />
              <small>Puedes dejarlo en blanco si aún no se ha realizado.</small>
            </label>
            <div className={`help-field ${draft.assistance ? "enabled" : ""}`}>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={draft.assistance}
                  onChange={(e) => patch({ assistance: e.target.checked })}
                />
                <CircleHelp size={21} />
                <span>
                  Necesito ayuda del responsable
                  <small>Por ejemplo, no sé qué material hace falta.</small>
                </span>
              </label>
              {draft.assistance && (
                <textarea
                  aria-label="Qué necesitas revisar"
                  rows={3}
                  value={draft.assistanceNote}
                  onChange={(e) => patch({ assistanceNote: e.target.value })}
                  placeholder="Explica qué duda tienes o qué hay que revisar…"
                />
              )}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="form-intro">
              <Package />
              <div>
                <h3>Materiales y detalles</h3>
                <p>Añade lo que sabes. El responsable pondrá los precios.</p>
              </div>
            </div>
            {draft.items.map((item, index) => (
              <div className="material-edit" key={item.id}>
                <label>
                  Material {index + 1}
                  <input
                    value={item.description}
                    onChange={(e) =>
                      patch({
                        items: draft.items.map((i) =>
                          i.id === item.id
                            ? { ...i, description: e.target.value }
                            : i,
                        ),
                      })
                    }
                    placeholder="Ej. Placa de yeso laminado"
                  />
                </label>
                <label>
                  Cantidad
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) =>
                      patch({
                        items: draft.items.map((i) =>
                          i.id === item.id
                            ? { ...i, quantity: Number(e.target.value) }
                            : i,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Unidad
                  <select
                    value={item.unit}
                    onChange={(e) =>
                      patch({
                        items: draft.items.map((i) =>
                          i.id === item.id ? { ...i, unit: e.target.value } : i,
                        ),
                      })
                    }
                  >
                    {["ud", "m", "m²", "kg", "l", "h"].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Eliminar material ${index + 1}`}
                  onClick={() =>
                    patch({
                      items: draft.items.filter((i) => i.id !== item.id),
                    })
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary dashed"
              onClick={() =>
                patch({
                  items: [
                    ...draft.items,
                    {
                      id: crypto.randomUUID(),
                      description: "",
                      quantity: 1,
                      unit: "ud",
                      unitPrice: 0,
                    },
                  ],
                })
              }
            >
              <Plus size={18} />
              Añadir material
            </button>
            <label className="upload-box">
              <Camera size={25} />
              <strong>Añadir fotos del trabajo</strong>
              <span>
                Desde tu cámara o galería · hasta 5 fotos · 5 MB por foto
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  const chosen = Array.from(e.target.files || []);
                  if (chosen.some((f) => f.size > 5 * 1024 * 1024)) {
                    setError("Cada foto debe pesar menos de 5 MB.");
                    return;
                  }
                  if (chosen.length + draft.photos.length > 5) {
                    setError("Puedes adjuntar un máximo de 5 fotos por parte.");
                    return;
                  }
                  setError("");
                  setFiles(chosen);
                }}
              />
              {files.length > 0 && (
                <b>{files.length} foto(s) seleccionada(s)</b>
              )}
            </label>
            {draft.photos.length > 0 && (
              <p className="muted">
                Este parte ya tiene {draft.photos.length} foto(s) guardada(s).
              </p>
            )}
            <label>
              Observaciones (opcional)
              <textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                placeholder="Ej. Se necesita acceder antes de la apertura del local"
              />
            </label>
            <div className="quiet-note">
              <Save size={16} />
              <span>
                El borrador se conserva en este dispositivo hasta que lo
                registres. Las fotos se adjuntan al guardar.
              </span>
            </div>
          </>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <button
          className="button secondary"
          onClick={
            step === 0
              ? onClose
              : () => {
                  setError("");
                  setStep((s) => s - 1);
                }
          }
          disabled={busy}
        >
          {step === 0 ? (
            "Cerrar"
          ) : (
            <>
              <ArrowLeft size={17} />
              Atrás
            </>
          )}
        </button>
        <span className="step-counter">Paso {step + 1} de 3</span>
        {step < 2 ? (
          <button className="button primary" onClick={next}>
            Continuar
            <ArrowRight size={17} />
          </button>
        ) : (
          <button className="button primary" disabled={busy} onClick={submit}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Check size={18} />
            )}{" "}
            {busy ? "Guardando…" : "Registrar trabajo"}
          </button>
        )}
      </footer>
    </Modal>
  );
}

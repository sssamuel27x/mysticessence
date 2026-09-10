"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { DECANT_SIZES, type DecantSize } from "../functions/decant-pricing.mjs";
import { normalizeBlockedDecantSizes } from "../functions/decant-availability.mjs";
import { firebaseEnabled, saveDecantAvailability, watchDecantAvailability } from "./firebase";

const PREVIEW_KEY = "mystic-decant-availability-preview-v1";
type Availability = {
  blockedSizes: DecantSize[];
  ready: boolean;
  error: string;
  localOnly: boolean;
  save: (sizes: DecantSize[]) => Promise<void>;
};
const AvailabilityContext = createContext<Availability | null>(null);

export function DecantAvailabilityProvider({ children }: { children: ReactNode }) {
  const [blockedSizes, setBlockedSizes] = useState<DecantSize[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    const local = !firebaseEnabled || ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    setLocalOnly(local);
    if (local) {
      const read = () => {
        try {
          setBlockedSizes(normalizeBlockedDecantSizes(JSON.parse(localStorage.getItem(PREVIEW_KEY) || "[]")));
          setError("");
        } catch { setError("Não foi possível carregar a disponibilidade dos decants."); }
        setReady(true);
      };
      read();
      const onStorage = (event: StorageEvent) => { if (!event.key || event.key === PREVIEW_KEY) read(); };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    return watchDecantAvailability((sizes) => {
      setBlockedSizes(sizes);
      setReady(true);
      setError("");
    }, () => {
      setReady(true);
      setError("Não foi possível confirmar a disponibilidade dos decants. Tente novamente.");
    });
  }, []);

  async function save(sizes: DecantSize[]) {
    if (!ready || error) throw new Error(error || "Aguarde pelo carregamento dos decants.");
    const next = normalizeBlockedDecantSizes(sizes);
    if (localOnly) localStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
    else await saveDecantAvailability(next);
    setBlockedSizes(next);
  }

  return <AvailabilityContext.Provider value={{ blockedSizes, ready, error, localOnly, save }}>{children}</AvailabilityContext.Provider>;
}

export function useDecantAvailability() {
  const value = useContext(AvailabilityContext);
  if (!value) throw new Error("DecantAvailabilityProvider is required");
  return value;
}

export function DecantAvailabilityControls({ lang, disabled = false }: { lang: "pt" | "en"; disabled?: boolean }) {
  const { blockedSizes, ready, error: loadError, localOnly, save } = useDecantAvailability();
  const [draft, setDraft] = useState<DecantSize[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const selected = draft ?? blockedSizes;
  const pt = lang === "pt";

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try { await save(selected); setDraft(null); setSaved(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : (pt ? "Não foi possível guardar." : "Could not save.")); }
    finally { setBusy(false); }
  }

  return <section className="decant-availability" aria-labelledby="decant-availability-title">
    <h3 id="decant-availability-title">{pt ? "Esgotar decants por tamanho" : "Sold-out decant sizes"}</h3>
    <fieldset disabled={disabled || busy || !ready || Boolean(loadError)}>
      <legend>{pt ? "Todos os perfumes" : "All fragrances"}</legend>
      <div className="decant-availability-sizes">
        {DECANT_SIZES.map((size) => <label key={size}>
          <strong>{size} ml</strong>
          <span><input type="checkbox" checked={selected.includes(size)} aria-label={pt ? `Esgotar todos os decants de ${size} ml` : `Mark all ${size} ml decants sold out`} onChange={(event) => {
            setDraft(event.target.checked ? [...selected, size] : selected.filter((value) => value !== size));
            setSaved(false);
            setError("");
          }} />{pt ? "Esgotado" : "Sold out"}</span>
        </label>)}
      </div>
      <button type="button" className="ghost-button" disabled={draft === null} onClick={() => void submit()}><Save size={17} />{busy ? (pt ? "A guardar..." : "Saving...") : (pt ? "Guardar disponibilidade" : "Save availability")}</button>
    </fieldset>
    {localOnly && <p className="decant-availability-message">{pt ? "Modo local: alterações apenas neste navegador." : "Local mode: changes in this browser only."}</p>}
    {(error || loadError) && <p className="auth-error" role="alert">{error || loadError}</p>}
    {saved && <p className="decant-availability-message" role="status">{pt ? "Disponibilidade guardada." : "Availability saved."}</p>}
  </section>;
}

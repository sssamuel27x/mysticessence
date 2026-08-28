"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Save, Trash2, Truck, X } from "lucide-react";
import { firebaseEnabled, saveShippingSettings, watchShippingSettings } from "./firebase";
import { DEFAULT_SHIPPING_SETTINGS, MAX_CARRIERS, SHIPPING_ZONE_IDS, isValidShippingSettings, normalizeShippingSettings, shippingSettingsEqual, type ShippingSettings, type ShippingZone } from "../functions/shipping.mjs";

const PREVIEW_KEY = "mystic-shipping-preview-v1";
type ShippingContextValue = {
  settings: ShippingSettings;
  ready: boolean;
  error: string;
  localOnly: boolean;
  previewChanged: boolean;
  save: (settings: ShippingSettings) => Promise<void>;
};
const ShippingContext = createContext<ShippingContextValue | null>(null);

export function ShippingSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ShippingSettings>(DEFAULT_SHIPPING_SETTINGS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) || !firebaseEnabled;
    setLocalOnly(local);
    if (local) {
      const readPreview = () => {
        try {
          const stored = JSON.parse(localStorage.getItem(PREVIEW_KEY) || "null");
          setSettings(normalizeShippingSettings(stored) ?? DEFAULT_SHIPPING_SETTINGS);
          setError("");
        } catch {
          setError("Não foi possível ler os portes guardados neste navegador.");
        }
        setReady(true);
      };
      readPreview();
      const onStorage = (event: StorageEvent) => { if (!event.key || event.key === PREVIEW_KEY) readPreview(); };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    return watchShippingSettings((next) => {
      setSettings(next);
      setReady(true);
      setError("");
    }, () => {
      setError("Não foi possível carregar os portes. Tente novamente.");
      setReady(true);
    });
  }, []);

  async function save(next: ShippingSettings) {
    if (!ready) throw new Error("Aguarde pelo carregamento dos portes.");
    if (!isValidShippingSettings(next)) throw new Error("Indique valores válidos, com um máximo de duas casas decimais.");
    if (localOnly) {
      try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(next)); }
      catch { throw new Error("Não foi possível guardar. Verifique o armazenamento do navegador."); }
    } else {
      await saveShippingSettings(next);
    }
    setSettings(next);
    setError("");
  }

  return <ShippingContext.Provider value={{ settings, ready, error, localOnly, previewChanged: localOnly && !shippingSettingsEqual(settings, DEFAULT_SHIPPING_SETTINGS), save }}>{children}</ShippingContext.Provider>;
}

export function useShippingSettings() {
  const value = useContext(ShippingContext);
  if (!value) throw new Error("ShippingSettingsProvider is required");
  return value;
}

const ZONE_LABELS = {
  pt: { continental: "Portugal Continental", islands: "Madeira / Açores", spain: "Espanha" },
  en: { continental: "Mainland Portugal", islands: "Madeira / Azores", spain: "Spain" },
};
type Draft = Record<ShippingZone, { freeFrom: string; carriers: { id: string; name: string; price: string; description: string }[] }>;

export function ShippingSettingsDialog({ lang, onClose }: { lang: "pt" | "en"; onClose: () => void }) {
  const { settings, ready, localOnly, error: loadError, save } = useShippingSettings();
  const [draft, setDraft] = useState(() => Object.fromEntries(SHIPPING_ZONE_IDS.map((zone) => [zone, { freeFrom: String(settings[zone].freeFrom), carriers: settings[zone].carriers.map((carrier) => ({ ...carrier, price: String(carrier.price) })) }])) as Draft);
  const [activeZone, setActiveZone] = useState<ShippingZone>("continental");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pt = lang === "pt";

  function updateZone(next: Draft[ShippingZone]) {
    setDraft((current) => ({ ...current, [activeZone]: next }));
    setSaved(false);
    setError("");
  }

  function changeTab(zone: ShippingZone) {
    setActiveZone(zone);
    dialog.current?.querySelector<HTMLButtonElement>(`#shipping-tab-${zone}`)?.focus();
  }

  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const next = Object.fromEntries(SHIPPING_ZONE_IDS.map((zone) => [zone, {
      freeFrom: draft[zone].freeFrom.trim() ? Number(draft[zone].freeFrom.replace(",", ".")) : NaN,
      carriers: draft[zone].carriers.map((carrier) => ({ ...carrier, name: carrier.name.trim(), description: carrier.description.trim(), price: carrier.price.trim() ? Number(carrier.price.replace(",", ".")) : NaN })),
    }]));
    if (!isValidShippingSettings(next)) {
      const invalidZone = SHIPPING_ZONE_IDS.find((zone) => !isValidShippingSettings({ ...DEFAULT_SHIPPING_SETTINGS, [zone]: next[zone] }));
      if (invalidZone) setActiveZone(invalidZone);
      setError(pt ? "Preencha o nome e o preço de cada transportadora e o limite de envio grátis. Use valores positivos ou zero, até duas casas decimais." : "Enter each carrier name and price, and the free shipping threshold. Use non-negative amounts with up to two decimal places.");
      return;
    }
    setError("");
    setBusy(true);
    setSaved(false);
    try { await save(next); setSaved(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível guardar os portes."); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="shipping-settings-dialog" aria-labelledby="shipping-settings-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit} noValidate>
      <header><div><Truck size={22} /><h2 id="shipping-settings-title">{pt ? "Portes de envio" : "Shipping rates"}</h2></div><button type="button" className="shipping-settings-close" onClick={onClose} disabled={busy} aria-label={pt ? "Fechar portes" : "Close shipping settings"} title={pt ? "Fechar" : "Close"}><X size={21} /></button></header>
      {localOnly && <p className="shipping-settings-notice">{pt ? "Modo local: estas alterações ficam apenas neste navegador, sem alterar a loja publicada." : "Local mode: changes stay in this browser and do not affect the published store."}</p>}
      <div className="shipping-tabs" role="tablist" aria-label={pt ? "Zona de entrega" : "Delivery zone"}>
        {SHIPPING_ZONE_IDS.map((zone, index) => <button type="button" role="tab" key={zone} id={`shipping-tab-${zone}`} aria-controls="shipping-zone-panel" aria-selected={activeZone === zone} tabIndex={activeZone === zone ? 0 : -1} onClick={() => setActiveZone(zone)} onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            changeTab(SHIPPING_ZONE_IDS[event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3]);
          }
        }}>{zone === "continental" ? "Portugal" : zone === "islands" ? (pt ? "Ilhas" : "Islands") : ZONE_LABELS[lang][zone]}</button>)}
      </div>
      <div role="tabpanel" id="shipping-zone-panel" aria-labelledby={`shipping-tab-${activeZone}`}>
        <fieldset disabled={busy || !ready} className="shipping-zone-editor">
          <legend>{ZONE_LABELS[lang][activeZone]}</legend>
          <label className="field shipping-free-threshold"><span>{pt ? "Grátis a partir de (€)" : "Free shipping from (€)"}</span><input type="number" inputMode="decimal" min="0" max="99999.99" step="0.01" required value={draft[activeZone].freeFrom} onChange={(event) => updateZone({ ...draft[activeZone], freeFrom: event.target.value })} /></label>
          <div className="shipping-carrier-list">
            {draft[activeZone].carriers.map((carrier, index) => <div className="shipping-carrier-editor" key={carrier.id}>
              <label className="field"><span>{pt ? "Transportadora" : "Carrier"}</span><input aria-label={`${pt ? "Transportadora" : "Carrier"} ${index + 1}`} value={carrier.name} placeholder="DHL" maxLength={80} required onChange={(event) => updateZone({ ...draft[activeZone], carriers: draft[activeZone].carriers.map((item) => item.id === carrier.id ? { ...item, name: event.target.value } : item) })} /></label>
              <label className="field"><span>{pt ? "Preço (€)" : "Price (€)"}</span><input aria-label={`${pt ? "Preço" : "Price"} ${index + 1}`} type="number" inputMode="decimal" min="0" max="999.99" step="0.01" placeholder="5.90" required value={carrier.price} onChange={(event) => updateZone({ ...draft[activeZone], carriers: draft[activeZone].carriers.map((item) => item.id === carrier.id ? { ...item, price: event.target.value } : item) })} /></label>
              <label className="field shipping-carrier-description"><span>{pt ? "Prazo / descrição" : "Delivery time / description"}</span><input aria-label={`${pt ? "Descrição" : "Description"} ${index + 1}`} value={carrier.description} placeholder={pt ? "6-8 dias" : "6-8 days"} maxLength={160} onChange={(event) => updateZone({ ...draft[activeZone], carriers: draft[activeZone].carriers.map((item) => item.id === carrier.id ? { ...item, description: event.target.value } : item) })} /></label>
              <button className="shipping-remove-carrier" type="button" title={pt ? "Remover transportadora" : "Remove carrier"} aria-label={`${pt ? "Remover transportadora" : "Remove carrier"} ${index + 1}`} onClick={() => updateZone({ ...draft[activeZone], carriers: draft[activeZone].carriers.filter((item) => item.id !== carrier.id) })}><Trash2 size={18} /></button>
            </div>)}
          </div>
          {!draft[activeZone].carriers.length && <p className="shipping-settings-notice">{pt ? "Sem transportadoras: as entregas nesta zona ficam indisponíveis." : "No carriers: delivery to this zone is unavailable."}</p>}
          <button className="ghost-button shipping-add-carrier" type="button" disabled={draft[activeZone].carriers.length >= MAX_CARRIERS} onClick={() => updateZone({ ...draft[activeZone], carriers: [...draft[activeZone].carriers, { id: crypto.randomUUID(), name: "", price: "", description: "" }] })}><Plus size={18} />{pt ? "Adicionar transportadora" : "Add carrier"}</button>
        </fieldset>
      </div>
      {(error || loadError) && <p className="auth-error" role="alert">{error || loadError}</p>}
      {saved && <p className="shipping-settings-success" role="status">{pt ? (localOnly ? "Portes guardados neste navegador." : "Portes guardados.") : (localOnly ? "Shipping rates saved in this browser." : "Shipping rates saved.")}</p>}
      <footer><button type="button" className="ghost-button" onClick={onClose} disabled={busy}>{pt ? "Fechar" : "Close"}</button><button type="submit" className="primary-button" disabled={busy || !ready}><Save size={17} />{busy ? (pt ? "A guardar..." : "Saving...") : (pt ? "Guardar portes" : "Save shipping rates")}</button></footer>
    </form>
  </dialog>;
}

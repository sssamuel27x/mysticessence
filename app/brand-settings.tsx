"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Search, Tag, X } from "lucide-react";
import { brandKey, catalogueBrands, HIDDEN_BRANDS } from "./brand-catalogue";
import { firebaseEnabled, saveBrand, watchBrands } from "./firebase";

const PREVIEW_KEY = "mystic-brands-preview-v1";
type BrandContextValue = { brands: string[]; localOnly: boolean; ready: boolean; error: string; create: (name: string) => Promise<string> };
const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandsProvider({ children, catalogueNames, initialNames = [] }: { children: ReactNode; catalogueNames: string[]; initialNames?: string[] }) {
  const [created, setCreated] = useState<string[]>([]);
  const [localOnly, setLocalOnly] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const brands = catalogueBrands(created, catalogueNames, initialNames);

  useEffect(() => {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) || !firebaseEnabled;
    setLocalOnly(local);
    if (local) {
      const read = () => {
        try {
          const value: unknown = JSON.parse(localStorage.getItem(PREVIEW_KEY) || "[]");
          setCreated(Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : []);
          setError("");
        } catch { setError("Não foi possível ler as marcas guardadas neste navegador."); }
        setReady(true);
      };
      read();
      const onStorage = (event: StorageEvent) => { if (!event.key || event.key === PREVIEW_KEY) read(); };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    return watchBrands((names) => { setCreated(names); setReady(true); setError(""); }, () => { setReady(true); setError("Não foi possível carregar as marcas criadas."); });
  }, []);

  async function create(raw: string) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!ready) throw new Error("Aguarde pelo carregamento das marcas.");
    if (!name || name.length > 80) throw new Error("Indique uma marca com 1 a 80 caracteres.");
    if (HIDDEN_BRANDS.has(brandKey(name))) throw new Error("Esta marca foi retirada do catálogo de marcas.");
    if (brands.some((existing) => brandKey(existing) === brandKey(name))) throw new Error("Esta marca já existe. Selecione-a na lista.");
    const next = catalogueBrands(created, [name]);
    if (localOnly) localStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
    else await saveBrand(name);
    setCreated(next);
    setError("");
    return name;
  }

  return <BrandContext.Provider value={{ brands, localOnly, ready, error, create }}>{children}</BrandContext.Provider>;
}

export function useBrands() {
  const value = useContext(BrandContext);
  if (!value) throw new Error("BrandsProvider is required");
  return value;
}

export function BrandSettingsDialog({ lang, onClose, onCreated }: { lang: "pt" | "en"; onClose: () => void; onCreated?: (name: string) => void }) {
  const { brands, localOnly, ready, error: loadError, create } = useBrands();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pt = lang === "pt";
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const created = await create(name);
      setName("");
      setMessage(pt ? `Marca criada: ${created}` : `Brand created: ${created}`);
      onCreated?.(created);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível criar a marca."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="shipping-settings-dialog brand-settings-dialog" aria-labelledby="brand-settings-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><Tag size={22} /><h2 id="brand-settings-title">{pt ? "Marcas" : "Brands"}</h2></div><button type="button" className="shipping-settings-close" disabled={busy} onClick={onClose} aria-label={pt ? "Fechar marcas" : "Close brands"}><X size={21} /></button></header>
    {localOnly && <p className="shipping-settings-notice">{pt ? "As marcas criadas aqui ficam guardadas neste navegador durante os testes locais." : "New brands are saved in this browser during local testing."}</p>}
    <form className="brand-create-form" onSubmit={submit}>
      <label className="field"><span>{pt ? "Nome da marca" : "Brand name"}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={busy} /></label>
      <button className="primary-button" type="submit" disabled={busy || !ready || !name.trim()}><Plus size={18} />{busy ? (pt ? "A criar..." : "Creating...") : (pt ? "Criar marca" : "Create brand")}</button>
    </form>
    {(error || loadError) && <p className="auth-error" role="alert">{error || loadError}</p>}
    {message && <p className="shipping-settings-success" role="status">{message}</p>}
    <label className="brand-search"><Search size={18} /><input aria-label={pt ? "Pesquisar marcas" : "Search brands"} placeholder={pt ? "Pesquisar marcas" : "Search brands"} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <ul className="brand-settings-list">{brands.filter((brand) => brandKey(brand).includes(brandKey(query))).map((brand) => <li key={brandKey(brand)}>{brand}</li>)}</ul>
  </dialog>;
}

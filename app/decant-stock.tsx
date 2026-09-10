"use client";

import { useEffect, useState } from "react";
import { PackageCheck, Save } from "lucide-react";
import { DECANT_SIZES, type DecantSize } from "../functions/decant-pricing.mjs";
import { saveDecantStock, watchDecantStock } from "./firebase";

type DecantStock = Record<DecantSize, number | null>;
type DraftStock = Record<DecantSize, string>;

const emptyDraft = (): DraftStock => ({ 2: "", 5: "", 10: "" });

export function DecantStockControls({ lang, disabled = false }: { lang: "pt" | "en"; disabled?: boolean }) {
  const [stock, setStock] = useState<DecantStock | null>(null);
  const [draft, setDraft] = useState<DraftStock>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pt = lang === "pt";

  useEffect(() => watchDecantStock((next) => {
    setStock(next);
    setDraft(next ? Object.fromEntries(DECANT_SIZES.map((size) => [size, next[size] === null ? "" : String(next[size])])) as DraftStock : emptyDraft());
    setReady(true);
    setError("");
  }, (failure) => {
    setReady(true);
    setError(failure.message);
  }), []);

  function update(size: DecantSize, value: string) {
    if (value !== "" && (!/^\d+$/.test(value) || Number(value) > 1000000)) return;
    setDraft((current) => ({ ...current, [size]: value }));
    setSaved(false);
    setError("");
  }

  async function save() {
    const next = Object.fromEntries(DECANT_SIZES.map((size) => [size, draft[size] === "" ? null : Number(draft[size])])) as DecantStock;
    if (DECANT_SIZES.some((size) => {
      const quantity = next[size];
      return quantity !== null && (!Number.isInteger(quantity) || quantity < 0);
    })) {
      setError(pt ? "Use uma quantidade inteira ou deixe o campo vazio para ilimitado." : "Use a whole quantity or leave the field empty for unlimited stock.");
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await saveDecantStock(next, stock);
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : (pt ? "Não foi possível guardar o stock." : "Could not save stock."));
    } finally {
      setBusy(false);
    }
  }

  return <section className="decant-stock" aria-labelledby="decant-stock-title">
    <div className="decant-stock-heading">
      <PackageCheck size={21} />
      <div>
        <h3 id="decant-stock-title">{pt ? "Stock geral por tamanho" : "Shared stock by size"}</h3>
        <p>{pt ? "Total de frascos de decant disponível para todos os perfumes." : "Total decant vials available across all fragrances."}</p>
      </div>
    </div>
    <fieldset disabled={disabled || busy || !ready}>
      <legend className="sr-only">{pt ? "Quantidades gerais de decants" : "Shared decant quantities"}</legend>
      <div className="decant-stock-sizes">
        {DECANT_SIZES.map((size) => <label key={size}>
          <span>{size} ml</span>
          <input type="number" min="0" max="1000000" step="1" inputMode="numeric" value={draft[size]} onChange={(event) => update(size, event.target.value)} placeholder={pt ? "Ilimitado" : "Unlimited"} aria-label={pt ? `Stock geral de decants de ${size} ml` : `Shared stock for ${size} ml decants`} />
          <small>{pt ? "unidades" : "units"}</small>
        </label>)}
      </div>
      <button type="button" className="ghost-button" onClick={() => void save()}><Save size={17} />{busy ? (pt ? "A guardar..." : "Saving...") : (pt ? "Guardar stock na Firebase" : "Save stock to Firebase")}</button>
    </fieldset>
    {ready && !error && <p className="decant-stock-note">{pt ? "Deixe um campo vazio para manter esse tamanho ilimitado." : "Leave a field empty to keep that size unlimited."}</p>}
    {saved && <p className="decant-stock-success" role="status">{pt ? "Stock geral guardado na Firebase." : "Shared stock saved to Firebase."}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>;
}

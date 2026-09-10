"use client";

import { useEffect, useState } from "react";
import { PackageCheck, Save } from "lucide-react";
import { DECANT_SIZES, type DecantSize } from "../functions/decant-pricing.mjs";
import { saveDecantStock, watchDecantStock } from "./firebase";

type DecantStock = Record<DecantSize, number>;
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
    setDraft(next ? Object.fromEntries(DECANT_SIZES.map((size) => [size, String(next[size])])) as DraftStock : emptyDraft());
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
    const next = Object.fromEntries(DECANT_SIZES.map((size) => [size, Number(draft[size])])) as DecantStock;
    if (DECANT_SIZES.some((size) => draft[size] === "" || !Number.isInteger(next[size]) || next[size] < 0)) {
      setError(pt ? "Indique uma quantidade inteira para os três tamanhos." : "Enter a whole quantity for all three sizes.");
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
          <input type="number" min="0" max="1000000" step="1" inputMode="numeric" value={draft[size]} onChange={(event) => update(size, event.target.value)} placeholder="0" aria-label={pt ? `Stock geral de decants de ${size} ml` : `Shared stock for ${size} ml decants`} />
          <small>{pt ? "unidades" : "units"}</small>
        </label>)}
      </div>
      <button type="button" className="ghost-button" onClick={() => void save()}><Save size={17} />{busy ? (pt ? "A guardar..." : "Saving...") : (pt ? "Guardar stock na Firebase" : "Save stock to Firebase")}</button>
    </fieldset>
    {!stock && ready && !error && <p className="decant-stock-note">{pt ? "Ainda não configurado. As vendas continuam sem limite geral até guardar os três valores." : "Not configured yet. Sales remain without a shared limit until all three values are saved."}</p>}
    {saved && <p className="decant-stock-success" role="status">{pt ? "Stock geral guardado na Firebase." : "Shared stock saved to Firebase."}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>;
}

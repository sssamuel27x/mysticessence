import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Mystic Essence storefront", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Mystic Essence \| Perfumaria Árabe<\/title>/i);
  assert.match(html, /<link\b[^>]*rel="icon"[^>]*href="\/favicon\.png"/);
  assert.match(html, /Perfumaria Árabe/i);
  assert.match(html, /Perfumes Masculinos/i);
  assert.match(html, /Os meus favoritos/i);
  const banner = html.match(/<div class="announcement"[\s\S]*?<\/div><\/div>/)?.[0] ?? "";
  assert.match(banner, /Envios grátis para Portugal Continental a partir de 85,00/i);
  assert.doesNotMatch(banner, /ilhas|Espanha|Venha descobrir/i);
  assert.equal((banner.match(/class="announcement-item"/g) ?? []).length, 8);
  assert.equal((banner.match(/aria-hidden="true"><b>/g) ?? []).length, 7);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

test("provides a square PNG favicon in the static homepage", async () => {
  const html = await readFile(new URL("../netlify/index.html", import.meta.url), "utf8");
  assert.match(html, /<link\b[^>]*rel="icon"[^>]*type="image\/png"[^>]*sizes="192x192"[^>]*href="\/favicon\.png"/);
  const icon = await readFile(new URL("../public/favicon.png", import.meta.url));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(icon.toString("ascii", 12, 16), "IHDR");
  assert.equal(icon.readUInt32BE(16), 192);
  assert.equal(icon.readUInt32BE(20), 192);
});

test("keeps admin pricing protected and its product editor responsive", async () => {
  const [page, css, firestoreRules, storageRules] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../storage.rules", import.meta.url), "utf8"),
  ]);

  assert.match(page, /applyGlobalDecantPricing\(decantPricingRules\)/);
  assert.match(page, /<DecantStockControls lang=\{lang\}/);
  assert.match(page, /await logoutFirebase\(\);\s*setCart\(\[\]\);\s*setCartOpen\(false\);/);
  assert.doesNotMatch(page, /\$\{selectedStock\}.*em stock/);
  const decantStock = await readFile(new URL("../app/decant-stock.tsx", import.meta.url), "utf8");
  assert.match(decantStock, /placeholder=\{pt \? "Ilimitado" : "Unlimited"\}/);
  assert.doesNotMatch(decantStock, /Ainda não configurado/);
  assert.match(page, /saveProductGroup\(nextProduct, nextDecantProduct, editBaseline.current\)/);
  assert.match(page, /A sessão não tem permissão de administrador/);
  assert.match(css, /\.admin-editor-modal\s*\{[^}]*width:\s*min\(1040px,/s);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.admin-variant-stock-row\s*\{[^}]*repeat\(2,/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.admin-variant-stock-row\s*\{[^}]*minmax\(0, 1fr\)/);
  assert.match(css, /\.listing-page \.filters\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.listing-page \.listing-hero\s*\{[^}]*min-height:\s*auto/);
  assert.match(page, /className="cart-shipping-track"[\s\S]*role="progressbar"/);
  assert.match(page, /onClick=\{\(\) => onUpdate\(item\.id,/);
  assert.match(page, /onClick=\{\(\) => onRemove\(item\.id\)\}/);
  assert.match(page, /className="primary-button" onClick=\{onCheckout\}|className="primary-button cart-checkout-button" onClick=\{onCheckout\}/);
  assert.match(css, /\.cart-drawer\s*\{[^}]*width:\s*min\(580px, 100vw\)/s);
  assert.match(css, /\.cart-summary\s*\{[^}]*safe-area-inset-bottom/s);
  assert.match(firestoreRules, /match \/settings\/decants/);
  assert.match(firestoreRules, /match \/settings\/decantStock/);
  assert.match(firestoreRules, /allow create, update: if isAdmin\(\)/);
  assert.match(storageRules, /allow write: if isAdmin\(\)/);
});

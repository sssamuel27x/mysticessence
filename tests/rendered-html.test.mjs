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
  assert.match(html, /Perfumaria Árabe/i);
  assert.match(html, /Perfumes Masculinos/i);
  assert.match(html, /Os meus favoritos/i);
  assert.match(html, /Envios gratuitos a partir de/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
});

test("keeps admin pricing protected and its product editor responsive", async () => {
  const [page, css, firestoreRules, storageRules] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../storage.rules", import.meta.url), "utf8"),
  ]);

  assert.match(page, /saveDecantPricing\(decantPricingRules\)/);
  assert.match(page, /saveFirebaseProduct\(product\.id, product\)/);
  assert.match(page, /A sessão não tem permissão de administrador/);
  assert.match(css, /\.admin-editor-modal\s*\{[^}]*width:\s*min\(1040px,/s);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.admin-variant-stock-row\s*\{[^}]*repeat\(2,/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.admin-variant-stock-row\s*\{[^}]*minmax\(0, 1fr\)/);
  assert.match(firestoreRules, /match \/settings\/decants/);
  assert.match(firestoreRules, /allow create, update: if isAdmin\(\)/);
  assert.match(storageRules, /allow write: if isAdmin\(\)/);
});

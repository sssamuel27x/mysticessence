import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set([
  "LISTING_PATHS", "LEGAL_PATHS", "SCENT_PROFILE_LABELS", "SCENT_PROFILES",
  "DISCOUNTS", "PROMOTION_ENDS", "productSet", "isNewProduct", "filterAdminCatalogue",
  "productDiscount", "productPromotionEnd", "productsForProfile", "asDecantProduct", "routeFromPath",
  "getProductAudiences", "toggleProductCategory",
]);
const declarations = ast.statements.filter((node) => {
  if (ts.isFunctionDeclaration(node)) return names.has(node.name?.text);
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.some((declaration) => names.has(declaration.name.getText(ast)));
  return false;
}).map((node) => node.getText(ast)).join("\n");
const js = ts.transpileModule(`${declarations}\nObject.assign(globalThis, { productSet, filterAdminCatalogue, productsForProfile, asDecantProduct, routeFromPath, getProductAudiences, toggleProductCategory });`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = vm.createContext({});
vm.runInContext(js, api);

const sample = (id, overrides = {}) => ({
  id, name: { pt: id, en: id }, brand: "Afnan", category: "Masculinos",
  audiences: ["men"], bestSeller: false, isNew: false, tag: "stock",
  scentProfile: "fresh", variants: [{ volume: "100ml", price: 40 }, { volume: "5ml", price: 5, isDecant: true }],
  ...overrides,
});
const products = [
  sample("cedro", { name: { pt: "Cédró Intenso", en: "Intense Cedar" }, bestSeller: true }),
  sample("rose", { category: "Femininos", audiences: ["women"], brand: "Lattafa", discount: 20 }),
  sample("oud", { category: "Unissexo", audiences: ["unisex"], discount: 10 }),
  sample("expired", { discount: 20, promotionEndsAt: "2000-01-01T00:00:00.000Z" }),
  sample("body-mist", { category: "Outros produtos", audiences: [] }),
  sample("decant-cedro", { isDecant: true }),
];
const ids = (items) => Array.from(items, (item) => item.id);

test("catalogue search matches names and brands without case or accent sensitivity", () => {
  assert.deepEqual(ids(api.filterAdminCatalogue(products, " CEDRO afnan ", "all", "all")), ["cedro"]);
  assert.deepEqual(ids(api.filterAdminCatalogue(products, "Lattafa", "all", "all")), ["rose"]);
});

test("catalogue category and highlight filters combine and ignore decant duplicates", () => {
  assert.deepEqual(ids(api.filterAdminCatalogue(products, "", "men", "best")), ["cedro"]);
  assert.deepEqual(ids(api.filterAdminCatalogue(products, "", "women", "sale")), ["rose"]);
  assert.deepEqual(ids(api.filterAdminCatalogue(products, "", "men", "sale")), []);
  assert.equal(api.filterAdminCatalogue(products, "", "all", "all").length, 5);
  assert.deepEqual(ids(api.filterAdminCatalogue(products, "does-not-exist", "all", "all")), []);
});

test("multiple categories survive edits and appear in every selected listing without duplicate products", () => {
  let selected = api.toggleProductCategory({ category: "Unissexo", audiences: ["unisex"] }, "Femininos", true);
  assert.deepEqual(Array.from(selected.audiences), ["women", "unisex"]);
  let product = sample("mixed", { ...selected, bestSeller: true });
  let catalogue = [product, api.asDecantProduct(product)];
  for (const kind of ["women", "unisex"]) {
    assert.deepEqual(ids(api.productSet(catalogue, kind)), ["mixed"]);
    assert.deepEqual(ids(api.filterAdminCatalogue(catalogue, "mixed", kind, "best")), ["mixed"]);
  }
  assert.deepEqual(ids(api.productSet(catalogue, "men")), []);
  assert.deepEqual(Array.from(api.asDecantProduct(product).audiences), ["women", "unisex"]);
  selected = api.toggleProductCategory(selected, "Masculinos", true);
  selected = api.toggleProductCategory(selected, "Femininos", true);
  assert.deepEqual(Array.from(selected.audiences), ["men", "women", "unisex"]);
  selected = api.toggleProductCategory(selected, "Unissexo", false);
  product = sample("mixed", selected);
  assert.deepEqual(ids(api.productSet([product], "unisex")), []);
  assert.deepEqual(ids(api.productSet([product], "women")), ["mixed"]);
  assert.deepEqual(ids(api.productSet([product], "men")), ["mixed"]);
});

test("legacy categories still filter correctly, while an explicitly removed selection is not restored", () => {
  const legacy = sample("legacy", { category: "Femininos", audiences: undefined });
  assert.deepEqual(Array.from(api.getProductAudiences(legacy)), ["women"]);
  assert.deepEqual(ids(api.productSet([legacy], "women")), ["legacy"]);
  const empty = api.toggleProductCategory({ category: "Unissexo", audiences: ["unisex"] }, "Unissexo", false);
  assert.deepEqual(Array.from(api.getProductAudiences(empty)), []);
  assert.deepEqual(ids(api.productSet([sample("empty", empty)], "unisex")), []);
});

test("other products remain separate from perfume audiences and decants", () => {
  const selected = api.toggleProductCategory({ category: "Unissexo", audiences: ["women", "unisex"] }, "Outros produtos", true);
  assert.equal(selected.category, "Outros produtos");
  assert.deepEqual(Array.from(selected.audiences), []);
  const other = sample("cream", { ...selected, audiences: ["women"] });
  assert.deepEqual(ids(api.productSet([other], "women")), []);
  assert.equal(api.asDecantProduct(other), null);
  const perfume = api.toggleProductCategory(selected, "Femininos", true);
  assert.equal(perfume.category, "Femininos");
  assert.deepEqual(Array.from(perfume.audiences), ["women"]);
});

test("product editor uses checkboxes and saves the selected audiences rather than restoring old categories", () => {
  const admin = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "AdminPage").getText(ast);
  assert.match(admin, /className="admin-categories"/);
  assert.match(admin, /toggleProductCategory\(current, option.category, checked\)/);
  assert.match(admin, /audiences: getProductAudiences\(product\)/);
  assert.match(admin, /audiences: getProductAudiences\(draft\)/);
  assert.match(admin, /!isOtherProduct && !draft.audiences.length/);
  assert.doesNotMatch(admin, /<select value=\{draft.category\}/);
});

test("other products have their own listing and do not generate perfume decants", () => {
  assert.deepEqual(ids(api.productSet(products, "other")), ["body-mist"]);
  assert.equal(api.asDecantProduct(products[4]), null);
  assert.equal(api.asDecantProduct(products[0]).id, "decant-cedro");
  assert.ok(!ids(api.productsForProfile(products, "fresh")).includes("body-mist"));
});

test("new navigation destinations support direct URLs", () => {
  assert.equal(api.routeFromPath("/outros-produtos/").listing, "other");
  assert.equal(api.routeFromPath("/conta/favoritos").view, "favorites");
  assert.equal(api.routeFromPath("/conta").view, "account");
  assert.equal(api.routeFromPath("/perfumes/unissexo").listing, "unisex");
});

test("mobile header exposes a direct, focused catalogue search", () => {
  const header = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Header").getText(ast);
  assert.match(header, /className="mobile-header-search-button"/);
  assert.match(header, /setMobileSearchOpen\(\(open\) => !open\)/);
  assert.match(header, /mobileSearchInput\.current\?\.focus\(\)/);
  assert.match(header, /className="mobile-header-search-panel"/);
  assert.match(header, /setMobileSearchOpen\(false\); onProduct\(product\.id\)/);
  assert.match(header, /className="mobile-nav"[\s\S]*onListing\("best"\)[\s\S]*onListing\("new"\)/);
});

test("home no longer contains hero actions or the store strip", () => {
  const hero = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Hero").getText(ast);
  const home = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Storefront").getText(ast);
  assert.doesNotMatch(hero, /hero-actions|onListing/);
  assert.doesNotMatch(home, /StoreStrip/);
  assert.match(home, /<Footer/);
});

test("description follows purchase and service information, before reviews and related products", () => {
  const detail = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "ProductDetail").getText(ast);
  const descriptionIndex = detail.indexOf('className="detail-description"');
  assert.ok(descriptionIndex > detail.indexOf('className="detail-service-note"'));
  assert.ok(descriptionIndex < detail.indexOf("<ProductReviews"));
  assert.ok(descriptionIndex < detail.lastIndexOf("<ProductCard"));
  assert.equal(detail.match(/className="detail-description"/g)?.length, 1);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "saveProduct") handler = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler);

for (const lang of ["pt", "en"]) {
  test(`failed image upload preserves the draft and releases save state (${lang})`, async () => {
    const error = Object.assign(new Error("Firebase denied products/private-path.png"), { code: "storage/unauthorized" });
    const state = { error: "", busy: false, progress: "", saved: false, open: true };
    const draftImages = [{ id: "first", file: { name: "first.png" } }, { id: "second", file: { name: "second.png" } }];
    let images = draftImages;
    let uploads = 0;
    const context = {
      Error, lang, adminBusy: false, products: [], editingId: null, PRODUCTS: [{}],
      newProductId: { current: "custom-test" },
      draft: { category: "Unissexo", audiences: ["unisex"], price: "20", volume: "100ml" },
      draftVariants: [{ volume: "100ml", price: "20", stock: "", soldout: false, isDecant: false }],
      draftImages, firebaseEnabled: true,
      setProductSaveError: value => { state.error = value; },
      setAdminBusy: value => { state.busy = value; },
      setUploadProgress: value => { state.progress = value; },
      setDraftImages: update => { images = update(images); },
      uploadProductImage: async () => {
        if (++uploads === 1) return { imageUrl: "/saved.png", imagePath: "products/test/saved.png" };
        throw error;
      },
      saveProductGroup: () => { state.saved = true; },
      setEditorOpen: value => { state.open = value; },
      window: { alert: () => { throw new Error("Native alert must not block recovery"); } },
    };
    vm.createContext(context);
    vm.runInContext(ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    await context.saveProduct({ preventDefault() {} });
    assert.equal(state.busy, false);
    assert.equal(state.progress, "");
    assert.equal(state.saved, false);
    assert.equal(state.open, true);
    assert.match(state.error, lang === "pt" ? /dados preenchidos foram mantidos/ : /details have been kept/);
    assert.doesNotMatch(state.error, /private-path|storage\/unauthorized/);
    assert.equal(images[0].file, undefined);
    assert.equal(images[0].imageUrl, "/saved.png");
    assert.equal(images[1].file, draftImages[1].file);
  });
}

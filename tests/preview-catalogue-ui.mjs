// Isolated UI preview: no Firebase connection or production data writes.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const pagePath = resolve(root, "app/page.tsx");
const source = readFileSync(pagePath, "utf8");
const ast = ts.createSourceFile(pagePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const firebaseImport = ast.statements.find((node) => ts.isImportDeclaration(node) && node.moduleSpecifier.text === "./firebase");
const firebaseExports = [...new Set([...firebaseImport.importClause.namedBindings.elements.filter((node) => !node.isTypeOnly).map((node) => node.propertyName?.text ?? node.name.text), 'watchShippingSettings', 'saveShippingSettings', 'watchBrands', 'saveBrand', 'watchDecantAvailability', 'saveDecantAvailability'])];
const mocks = firebaseExports.map((name) => `export const ${name} = ${name === "storageEnabled" ? "true" : name.endsWith("Enabled") ? "false" : name === "uploadProductImage"
  ? "async (_id, file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({imageUrl:reader.result}); reader.onerror = reject; reader.readAsDataURL(file); })"
  : "() => { throw new Error('Firebase is disabled in the isolated preview'); }"};`).join("\n");

const client = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPage, AccountPage, ProductGallery, CheckoutPage, BrandBand, ProductDetail, PRODUCTS, COPY } from '/app/page.tsx';
import { ShippingSettingsProvider } from '/app/shipping-settings.tsx';
import { BrandsProvider } from '/app/brand-settings.tsx';
import { DecantAvailabilityProvider, useDecantAvailability } from '/app/decant-availability.tsx';
import { applyDecantAvailability } from '/functions/decant-availability.mjs';
import { productsForBrand } from '/app/brand-catalogue.ts';
import '/app/globals.css';
const noop = () => {};
const make = (id, extra) => ({...PRODUCTS[0], id, name:{pt:id,en:id}, discount:0, bestSeller:false, isNew:false, ...extra});
const samples = [
  make('Cedro', {category:'Masculinos', audiences:['men'], brand:'Afnan', bestSeller:true, images:[{imageUrl:PRODUCTS[0].imageUrl},{imageUrl:PRODUCTS.find(p=>p.imageUrl && p.imageUrl!==PRODUCTS[0].imageUrl).imageUrl}]}),
  make('Rosa', {category:'Femininos', audiences:['women'], brand:'Lattafa', discount:20}),
  make('Oud', {category:'Unissexo', audiences:['unisex'], brand:'Armaf'}),
  make('Creme', {category:'Outros produtos', audiences:[], brand:'Lattafa', variants:[{volume:'200ml',price:15}]})
];
function Fixture() {
  const {blockedSizes} = useDecantAvailability();
  const [products,setProducts] = useState(samples);
  const [folders,setFolders] = useState([{id:'daily',name:'Dia a dia',productIds:['Cedro']}]);
  const [page,setPage] = useState('admin');
  const [chosenBrand,setChosenBrand] = useState('');
  const [savedOrder,setSavedOrder] = useState(null);
  const session = {uid:'offline-ui-fixture',name:'Teste local',email:'preview@example.invalid',role:'admin'};
  return <ShippingSettingsProvider><BrandsProvider catalogueNames={products.map(p=>p.brand)}><nav aria-label="Test views"><button onClick={()=>setPage('admin')}>Admin preview</button><button onClick={()=>setPage('favorites')}>Favorites preview</button><button onClick={()=>setPage('gallery')}>Gallery preview</button><button onClick={()=>setPage('checkout')}>Checkout preview</button><button onClick={()=>setPage('brands')}>Brands preview</button><button onClick={()=>setPage('detail')}>Detail preview</button></nav>{page==='checkout'
    ? <><CheckoutPage t={COPY.pt} lang="pt" cart={[{...products[0],price:20,qty:1}]} coupons={[]} onCreateOrder={setSavedOrder} onBack={()=>setPage('admin')}/>{savedOrder && <pre aria-label="Saved order">{JSON.stringify(savedOrder,null,2)}</pre>}</>
    : page==='brands'
    ? <><BrandBand onBrand={setChosenBrand}/><h1>{chosenBrand}</h1><ul aria-label="Brand products">{productsForBrand(products,chosenBrand).map(p=><li key={p.id}>{p.name.pt}</li>)}</ul></>
    : page==='detail'
    ? <ProductDetail t={COPY.pt} lang="pt" product={applyDecantAvailability(products[0],blockedSizes)} products={products} onListing={noop} onProduct={noop} onCart={noop} onFavorite={noop} favoriteFolders={[]} session={null} orders={[]} onLogin={noop}/>
    : page==='gallery'
    ? <main style={{width:'min(100%, 600px)',margin:'auto'}}><ProductGallery key={products[0].id} lang="pt" product={products[0]}/></main>
    : page==='admin'
    ? <AdminPage lang="pt" session={session} products={products} setProducts={setProducts} orders={[]} setOrders={noop} coupons={[]} setCoupons={noop} onShop={noop} onLogout={noop}/>
    : <AccountPage favoritesOnly favoritesReady lang="pt" session={session} products={products} orders={[]} favoriteFolders={folders} setFavoriteFolders={setFolders} onProduct={noop} onSession={noop} onLogout={noop} onShop={noop}/>
  }</BrandsProvider></ShippingSettingsProvider>;
}
createRoot(document.getElementById('root')).render(<DecantAvailabilityProvider><Fixture/></DecantAvailabilityProvider>);
`;

const server = await createServer({
  configFile: false,
  envFile: false,
  root,
  cacheDir: resolve(root, "node_modules/.vite-ui-preview"),
  publicDir: resolve(root, "public"),
  server: { host: "127.0.0.1", port: 3001, strictPort: true },
  resolve: { alias: { "next/image": resolve(root, "netlify/image-shim.tsx") } },
  plugins: [
    {
      name: "isolated-catalogue-preview",
      enforce: "pre",
      resolveId(id, importer) {
        if (id === "./firebase" && importer?.startsWith(resolve(root, "app/"))) return "\0firebase-fixture";
        if (id === "/fixture.tsx") return "\0fixture.tsx";
      },
      load(id) {
        if (id === "\0firebase-fixture") return mocks;
        if (id === "\0fixture.tsx") return ts.transpileModule(client, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText;
      },
      transform(code, id) {
        if (id.split("?")[0] === pagePath) return `${code}\nexport { AdminPage, AccountPage, ProductGallery, CheckoutPage, BrandBand, ProductDetail, PRODUCTS, COPY };`;
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== "/") return next();
          const html = await vite.transformIndexHtml("/", '<!doctype html><html lang="pt"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated catalogue test</title></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
          res.setHeader("Content-Type", "text/html");
          res.end(html);
        });
      },
    },
    react(),
  ],
});
await server.listen();
server.printUrls();

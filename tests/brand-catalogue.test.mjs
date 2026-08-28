import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../app/brand-catalogue.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { brandKey, catalogueBrands, productsForBrand } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('new brands join the registry, deduplicated by whitespace, case and accents', () => {
  assert.deepEqual(catalogueBrands(['Nova Marca'], ['Afnan', 'AFNAN', '  nova   marca '], ['Lattafa']), ['Afnan', 'Lattafa', 'Nova Marca']);
  assert.equal(brandKey('  Élégance  Paris '), brandKey('elegance paris'));
});

test('retired brands stay out of all brand lists without deleting products', () => {
  const products = [{ id: 1, brand: 'Rave' }, { id: 2, brand: 'Aromatix x French Avenue' }, { id: 3, brand: 'French Avenue' }];
  assert.deepEqual(catalogueBrands(products.map(p => p.brand)), ['French Avenue']);
  assert.equal(products.length, 3);
});

test('brand pages find existing products despite inconsistent spelling whitespace or case', () => {
  const products = [{ id: 1, brand: 'NOVA MARCA' }, { id: 2, brand: ' Nova   Marca ' }, { id: 3, brand: 'Other' }];
  assert.deepEqual(productsForBrand(products, 'Nova Marca').map(p => p.id), [1, 2]);
  assert.deepEqual(productsForBrand(products, 'Empty brand'), []);
});

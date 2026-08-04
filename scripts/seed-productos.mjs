// Script puntual: migra src/mocks/productos.ts a supabase/seed.sql
// Uso: node scripts/seed-productos.mjs

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createJiti } from 'jiti';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url);

const { todosLosProductos } = await jiti.import(resolve(__dirname, '../src/mocks/productos.ts'));
const esCommon = (await jiti.import(resolve(__dirname, '../src/i18n/local/es/common.ts'))).default;
const euCommon = (await jiti.import(resolve(__dirname, '../src/i18n/local/eu/common.ts'))).default;

function esc(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const rows = todosLosProductos.map((p, index) => {
  const nombre_es = esCommon[p.nameKey] ?? p.nameKey;
  const nombre_eu = euCommon[p.nameKey] ?? nombre_es;
  const descripcion_es = esCommon[p.descKey] ?? null;
  const descripcion_eu = euCommon[p.descKey] ?? descripcion_es;
  const origen_es = esCommon[p.originKey] ?? null;
  const origen_eu = euCommon[p.originKey] ?? origen_es;

  return `  (${esc(nombre_es)}, ${esc(nombre_eu)}, ${esc(descripcion_es)}, ${esc(descripcion_eu)}, ${esc(origen_es)}, ${esc(origen_eu)}, ${esc(p.price)}, ${esc(p.category)}, ${esc(p.subcategory ?? null)}, ${esc(p.image)}, ${esc(p.badge)}, true, ${index})`;
}).join(',\n');

const sql = `-- Seed generado automáticamente desde src/mocks/productos.ts
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de supabase/schema.sql

insert into public.productos
  (nombre_es, nombre_eu, descripcion_es, descripcion_eu, origen_es, origen_eu, precio, categoria, subcategoria, imagen_url, estado, disponible, orden)
values
${rows};
`;

writeFileSync(resolve(__dirname, '../supabase/seed.sql'), sql, 'utf-8');
console.log(`Generado supabase/seed.sql con ${todosLosProductos.length} productos.`);

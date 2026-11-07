import { readFileSync } from 'node:fs';

// Simule les réponses publiques avec les JSON du serveur : aucune copie du catalogue dans le front.
export async function seedCatalog(server) {
  const filenames = {
    'brands.php': ['brands.json', 'brands'], 'categories.php': ['categories.json', 'categories'],
    'families.php': ['families.json', 'families'], 'product-types.php': ['product-types.json', 'productTypes'],
    'models.php': ['models.json', 'models'], 'dealers.php': ['dealers.json', 'dealers'], 'contacts.php': ['contacts.json', 'contact'],
    'products/motorcycles.php': ['products/motorcycles.json', 'products'], 'products/helmets.php': ['products/helmets.json', 'products'],
    'products/riding-gear.php': ['products/riding-gear.json', 'products'], 'products/spare-parts.php': ['products/spare-parts.json', 'products'],
  };
  const publicBrands = JSON.parse(readFileSync('server/storage/data/brands.json', 'utf8')).brands.filter((brand) => brand.isPublished !== false);
  const ids = new Set(publicBrands.map((brand) => brand.id));
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url).replace('/server/api/', '');
    const [filename, key] = filenames[path] ?? [];
    if (!filename) return { ok: false, status: 404 };
    const content = JSON.parse(readFileSync(`server/storage/data/${filename}`, 'utf8'));
    if (path === 'brands.php') content.brands = publicBrands;
    if (path === 'models.php') content.models = content.models.filter((model) => ids.has(model.brandId));
    if (path.startsWith('products/')) content[key] = content[key].filter((product) => product.status === 'PUBLISHED' && ids.has(product.brandId)).map((product) => ({ ...product, ...(Array.isArray(product.compatibleBrandIds) ? { compatibleBrandIds: product.compatibleBrandIds.filter((id) => ids.has(id)) } : {}) }));
    return { ok: true, status: 200, json: async () => path.startsWith('products/') ? { data: content[key] } : content };
  };
  try { await (await server.ssrLoadModule('/src/catalog/loadServerData.ts')).loadServerData(); }
  finally { globalThis.fetch = original; }
}

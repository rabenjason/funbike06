import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as netServer } from 'node:net';
import { randomBytes } from 'node:crypto';

const wasm = resolve('node_modules/.bin/php-wasm-cli');
const php = process.env.PHP_BINARY || (spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0 ? 'php' : existsSync(wasm) ? wasm : null);

test('API PHP : authentification, brouillons et cohérence des données', { skip: !php && 'PHP non installé : tests PHP ignorés', timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'funbike-api-test-'));
  cpSync(resolve('server'), join(dir, 'server'), { recursive: true });
  // Les fixtures sont isolées et le routeur empêche tout accès direct au stockage privé.
  const router = join(dir, 'router.php');
  writeFileSync(router, `<?php\n$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);\nif(preg_match('#^/server/(storage|scripts|api/_lib)(/|$)#',$p)){http_response_code(404);exit;}\nreturn false;\n`);
  const serverDir = join(dir, 'server');
  const initialPassword = `initial-${randomBytes(12).toString('hex')}`;
  const nextPassword = `changed-${randomBytes(12).toString('hex')}`;
  const created = spawnSync(php, [join(serverDir, 'scripts/create-admin.php'), 'test-admin'], { env: { ...process.env, FUNBIKE_TEMP_PASSWORD: initialPassword }, encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const listener = netServer();
  await new Promise((resolveReady) => listener.listen(0, '127.0.0.1', resolveReady));
  const port = listener.address().port;
  await new Promise((resolveClosed) => listener.close(resolveClosed));
  const child = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', dir, router], { stdio: 'ignore', env: process.env });
  const base = `http://127.0.0.1:${port}/server/api/`;
  let cookie = '';
  async function call(path, { method = 'GET', body, authenticated = false } = {}) {
    const headers = {}; if (authenticated && cookie) headers.Cookie = cookie;
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const setCookie = res.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json() };
  }
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) { try { if ((await fetch(base + 'brands.php')).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 100)); }
    assert.ok(ready, 'le serveur de test PHP doit démarrer');
    assert.equal((await fetch(`http://127.0.0.1:${port}/server/storage/data/brands.json`)).status, 404);
    const untrusted = await fetch(base + 'auth/login.php', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://malicious.invalid' }, body: JSON.stringify({ username: 'test-admin', password: initialPassword }) });
    assert.equal(untrusted.status, 403);
    assert.equal((await call('products/motorcycles.php?includeDrafts=1')).status, 401);
    assert.equal((await call('brands.php?includeDrafts=1')).status, 401);
    assert.equal((await call('models.php?includeDrafts=1')).status, 401);
    assert.equal((await call('homepage-selections.php', { method: 'PUT', body: { id: 'tvs-125-hlx-5g', categoryId: 'motos', field: 'isNewArrival', value: true } })).status, 401);
    assert.equal((await call('families.php', { method: 'POST', body: { name: 'Test', categoryId: 'motos' } })).status, 401);
    // Envoi public, lecture et gestion privées, avec contrôle des abus.
    const inquiry = { name: 'Client Essai', phone: '034 12 345 67', email: 'client@example.com', whatsapp: '+261 34 12 345 67', subject: 'pieces', message: 'Bonjour,\nje cherche une pièce.', website: '' };
    assert.equal((await fetch(`http://127.0.0.1:${port}/server/storage/private/messages.json`)).status, 404);
    assert.equal((await call('messages.php')).status, 401);
    assert.equal((await call('messages.php?id=00000000000000000000000000000000', { method: 'PUT', body: { status: 'READ' } })).status, 401);
    assert.equal((await call('messages.php?id=00000000000000000000000000000000', { method: 'DELETE' })).status, 401);
    const evilMessage = await fetch(base + 'messages.php', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://malicious.invalid' }, body: JSON.stringify(inquiry) });
    assert.equal(evilMessage.status, 403);
    assert.equal((await call('messages.php', { method: 'POST', body: { ...inquiry, email: 'invalide' } })).status, 400);
    assert.equal((await call('messages.php', { method: 'POST', body: { ...inquiry, website: 'spam' } })).status, 400);
    assert.equal((await call('messages.php', { method: 'POST', body: { ...inquiry, message: 'x'.repeat(9000) } })).status, 400);
    assert.equal((await call('messages.php', { method: 'POST', body: inquiry })).status, 201);
    for (let n = 0; n < 9; n++) assert.equal((await call('messages.php', { method: 'POST', body: { ...inquiry, name: `Client ${n}` } })).status, 201);
    assert.equal((await call('messages.php', { method: 'POST', body: inquiry })).status, 429);
    let login = await call('auth/login.php', { method: 'POST', body: { username: 'test-admin', password: initialPassword } });
    assert.equal(login.status, 200); assert.equal(login.body.mustChangePassword, true);
    assert.equal((await call('products/motorcycles.php?includeDrafts=1', { authenticated: true })).status, 403);
    assert.equal((await call('auth/change-password.php', { method: 'POST', authenticated: true, body: { currentPassword: initialPassword, newPassword: nextPassword, newPasswordConfirmation: nextPassword } })).status, 200);

    // Les messages restent lisibles seulement après authentification ; la pagination est faite côté serveur.
    const messageFile = join(serverDir, 'storage/private/messages.json');
    let storedMessages = JSON.parse(readFileSync(messageFile, 'utf8'));
    assert.equal(storedMessages.messages.length, 10);
    assert.equal(storedMessages.messages[0].message, inquiry.message);
    assert.equal(storedMessages.messages[0].whatsapp, inquiry.whatsapp);
    assert.equal(storedMessages.messages[0].status, 'NEW');
    for (let i = 1; i <= 15; i++) storedMessages.messages.push({ ...storedMessages.messages[0], id: randomBytes(16).toString('hex'), name: `Ancien ${i}`, createdAt: `2024-01-${String(i).padStart(2, '0')}T10:00:00Z` });
    writeFileSync(messageFile, JSON.stringify(storedMessages));
    const recent = await call('messages.php?page=1&order=desc', { authenticated: true });
    assert.equal(recent.status, 200); assert.equal(recent.body.total, 25); assert.equal(recent.body.pages, 3); assert.equal(recent.body.messages.length, 10);
    assert.equal(recent.body.messages[0].name, 'Client 8');
    const older = await call('messages.php?page=1&order=asc', { authenticated: true });
    assert.equal(older.body.messages[0].name, 'Ancien 1');
    assert.equal((await call('messages.php?page=2&order=asc', { authenticated: true })).body.messages.length, 10);
    assert.equal((await call('messages.php?page=3&order=asc', { authenticated: true })).body.messages.length, 5);
    assert.equal((await call('messages.php?page=99&order=asc', { authenticated: true })).body.page, 3);
    assert.equal((await call('messages.php?page=0', { authenticated: true })).status, 400);
    const messageId = recent.body.messages[0].id;
    assert.equal((await call(`messages.php?id=${messageId}`, { method: 'PUT', authenticated: true, body: { status: 'WRONG' } })).status, 400);
    const readMessage = await call(`messages.php?id=${messageId}`, { method: 'PUT', authenticated: true, body: { status: 'READ', message: 'intrusion' } });
    assert.equal(readMessage.status, 200); assert.equal(readMessage.body.message.status, 'READ'); assert.equal(readMessage.body.message.message, inquiry.message);
    assert.equal((await call(`messages.php?id=${messageId}`, { method: 'PUT', authenticated: true, body: { status: 'PROCESSED' } })).body.message.status, 'PROCESSED');
    assert.equal((await call(`messages.php?id=${messageId}`, { method: 'DELETE', authenticated: true })).status, 200);
    assert.equal((await call(`messages.php?id=${messageId}`, { method: 'DELETE', authenticated: true })).status, 404);
    assert.equal((await call('messages.php', { authenticated: true })).body.total, 24);
    storedMessages = JSON.parse(readFileSync(messageFile, 'utf8'));
    assert.equal(storedMessages.messages.length, 24);
    assert.ok(!storedMessages.messages.some((m) => m.id === messageId));
    // Un fichier endommagé ne doit jamais être remplacé par une boîte vide.
    const messagesBackup = readFileSync(messageFile, 'utf8');
    writeFileSync(messageFile, '{"messages":');
    assert.equal((await call('messages.php', { authenticated: true })).status, 500);
    assert.equal((await call('messages.php', { method: 'POST', body: inquiry })).status, 500);
    assert.equal(readFileSync(messageFile, 'utf8'), '{"messages":');
    writeFileSync(messageFile, messagesBackup);

    // Publication des marques : toutes les modifications ci-dessous ne concernent que la copie temporaire.
    const dataDir = join(serverDir, 'storage/data');
    const names = ['brands.json', 'models.json', ...['motorcycles', 'helmets', 'riding-gear', 'spare-parts'].map((n) => `products/${n}.json`)];
    const saved = new Map(names.map((name) => [name, readFileSync(join(dataDir, name), 'utf8')]));
    try {
      const legacy = (await call('brands.php')).body.brands.find((b) => b.id === 'tvs');
      assert.equal(legacy.isPublished, true); assert.equal(legacy.isPartner, false);
      const models = JSON.parse(saved.get('models.json'));
      models.models.push({ id: 'publication-test', name: 'Modèle publication test', brandId: 'tvs' });
      writeFileSync(join(dataDir, 'models.json'), JSON.stringify(models));
      for (const path of ['motorcycles', 'helmets', 'riding-gear', 'spare-parts']) {
        const filename = `products/${path}.json`;
        const data = JSON.parse(saved.get(filename));
        for (const p of data.products) { p.isNewArrival = false; p.isEquipementAccueil = false; }
        const sample = data.products[0];
        assert.ok(sample, filename);
        data.products.unshift({ ...sample, id: `publication-${path}`, brandId: 'tvs', status: 'PUBLISHED', isNewArrival: true, isEquipementAccueil: true });
        if (path === 'spare-parts') data.products.unshift({ ...sample, id: 'compat-publication', brandId: 'sherco', status: 'PUBLISHED', compatibleBrandIds: ['tvs', 'sherco'], isNewArrival: false });
        writeFileSync(join(dataDir, filename), JSON.stringify(data));
      }
      const editFlags = async (values) => {
        const body = new FormData(); body.set('_method', 'PUT');
        for (const [key, value] of Object.entries(values)) body.set(key, value);
        return call('brands.php?id=tvs', { method: 'POST', authenticated: true, body });
      };
      assert.equal((await editFlags({ isPublished: 'invalid' })).status, 400);
      assert.equal((await editFlags({ isPublished: 'false', isPartner: 'true' })).status, 200);
      assert.ok(!(await call('brands.php')).body.brands.some((b) => b.id === 'tvs'));
      const adminBrand = (await call('brands.php?includeDrafts=1', { authenticated: true })).body.brands.find((b) => b.id === 'tvs');
      assert.equal(adminBrand.isPublished, false); assert.equal(adminBrand.isPartner, true); assert.equal(adminBrand.isEquipmentBrand, legacy.isEquipmentBrand);
      assert.ok(!(await call('models.php')).body.models.some((m) => m.id === 'publication-test'));
      assert.ok((await call('models.php?includeDrafts=1', { authenticated: true })).body.models.some((m) => m.id === 'publication-test'));
      for (const path of ['motorcycles', 'helmets', 'riding-gear', 'spare-parts']) {
        const id = `publication-${path}`;
        assert.ok(!(await call(`products/${path}.php`)).body.data.some((p) => p.id === id));
        assert.equal((await call(`products/${path}.php?id=${id}`)).status, 404);
        assert.equal((await call(`products/${path}.php?id=${id}&includeDrafts=1`, { authenticated: true })).body.data.status, 'PUBLISHED');
      }
      assert.deepEqual((await call('products/spare-parts.php?id=compat-publication')).body.data.compatibleBrandIds, ['sherco']);
      assert.deepEqual((await call('products/spare-parts.php?id=compat-publication&includeDrafts=1', { authenticated: true })).body.data.compatibleBrandIds, ['tvs', 'sherco']);
      for (const path of ['homepage-highlights.php', 'homepage-equipment.php']) {
        assert.ok(!(await call(`${path}?includeDrafts=1`)).body.data.some((p) => p.id.startsWith('publication-')));
      }
      assert.equal((await editFlags({ isPublished: 'true' })).status, 200);
      assert.equal((await call('brands.php')).body.brands.find((b) => b.id === 'tvs').isPartner, true);
      assert.ok((await call('models.php')).body.models.some((m) => m.id === 'publication-test'));
      for (const path of ['motorcycles', 'helmets', 'riding-gear', 'spare-parts']) {
        assert.equal((await call(`products/${path}.php?id=publication-${path}`)).body.data.status, 'PUBLISHED');
      }
      assert.deepEqual((await call('products/spare-parts.php?id=compat-publication')).body.data.compatibleBrandIds, ['tvs', 'sherco']);
      assert.ok((await call('homepage-highlights.php')).body.data.some((p) => p.id === 'publication-motorcycles'));
      assert.ok((await call('homepage-equipment.php')).body.data.some((p) => p.id === 'publication-helmets'));
    } finally {
      for (const [name, text] of saved) writeFileSync(join(dataDir, name), text);
    }

    // Revendeurs et contact : lectures publiques, écritures réservées aux admins.
    const authenticatedCookie = cookie;
    assert.equal((await call('dealers.php', { method: 'POST', body: { city: 'Test' } })).status, 401);
    assert.equal((await call('contacts.php', { method: 'PUT', body: { address: 'Intrusion' } })).status, 401);
    cookie = authenticatedCookie;
    const existingDealers = (await call('dealers.php')).body.dealers;
    const existingContact = (await call('contacts.php')).body.contact;
    const dealer = { city: 'Testville', name: 'Essai A', kind: 'Atelier', address: 'Rue test', hours: 'Lundi : 9h – 17h\nDimanche : fermé', phone: '+261 34 12 345 67', email: 'test@example.com', desc: 'Description test', lat: -18.9, lon: 47.5, services: ['Motos', 'Atelier'] };
    const one = await call('dealers.php', { method: 'POST', authenticated: true, body: dealer });
    const two = await call('dealers.php', { method: 'POST', authenticated: true, body: { ...dealer, name: 'Essai B' } });
    assert.equal(one.status, 201); assert.equal(two.status, 201); assert.notEqual(one.body.dealer.key, two.body.dealer.key);
    assert.equal((await call(`dealers.php?key=${one.body.dealer.key}`, { method: 'PUT', authenticated: true, body: { ...dealer, name: 'Essai modifié' } })).status, 200);
    let published = (await call('dealers.php')).body.dealers;
    assert.equal(published.find((d) => d.key === one.body.dealer.key).hours, dealer.hours);
    assert.equal(published.find((d) => d.key === two.body.dealer.key).name, 'Essai B');
    const demo = existingDealers.find((d) => d.isDemo);
    if (demo) {
      const { key: demoKey, isDemo, ...oldClientBody } = demo;
      const demoEdit = await call(`dealers.php?key=${demoKey}`, { method: 'PUT', authenticated: true, body: oldClientBody });
      assert.equal(demoEdit.status, 200); assert.equal(demoEdit.body.dealer.isDemo, true);
    }
    const invalidGps = await call('dealers.php', { method: 'POST', authenticated: true, body: { ...dealer, lat: 500 } });
    assert.equal(invalidGps.status, 400);
    assert.equal((await call(`dealers.php?key=${one.body.dealer.key}`, { method: 'DELETE', authenticated: true })).status, 200);
    assert.equal((await call(`dealers.php?key=${two.body.dealer.key}`, { method: 'DELETE', authenticated: true })).status, 200);
    const changedHours = 'Lundi : 8h – 18h\nDimanche : fermé';
    const updatedContact = await call('contacts.php', { method: 'PUT', authenticated: true, body: { hours: changedHours, socialLinks: [{ label: 'Facebook', url: 'https://facebook.com/funbike' }] } });
    assert.equal(updatedContact.status, 200); assert.equal(updatedContact.body.contact.hours, changedHours);
    assert.equal((await call('contacts.php')).body.contact.hours, changedHours);
    assert.equal(updatedContact.body.contact.email, existingContact.email);
    assert.equal((await call('contacts.php', { method: 'PUT', authenticated: true, body: { socialLinks: [{ label: 'Lien', url: 'ftp://example.com' }] } })).status, 400);
    assert.equal((await call('contacts.php', { method: 'PUT', authenticated: true, body: existingContact })).status, 200);
    for (const path of ['families.php?id=off-road', 'product-types.php?id=enduro', 'brands.php?id=tvs', 'categories.php?id=motos']) {
      assert.equal((await call(path, { method: 'DELETE', authenticated: true })).status, 409, path);
    }
    const createdUser = await call('auth/users.php', { method: 'POST', authenticated: true, body: { username: 'test-editor' } });
    assert.equal(createdUser.status, 201); assert.equal(createdUser.body.user.role, 'admin');
    const superCookie = cookie;
    assert.equal((await call('auth/login.php', { method: 'POST', body: { username: 'test-editor', password: createdUser.body.temporaryPassword } })).status, 200);
    assert.equal((await call('auth/users.php', { authenticated: true })).status, 403);
    assert.equal((await call('auth/change-password.php', { method: 'POST', authenticated: true, body: { currentPassword: createdUser.body.temporaryPassword, newPassword: nextPassword, newPasswordConfirmation: nextPassword } })).status, 200);
    assert.equal((await call('auth/users.php', { authenticated: true })).status, 403);
    cookie = superCookie;
    assert.equal((await call(`auth/users.php?id=${createdUser.body.user.id}`, { method: 'DELETE', authenticated: true })).status, 200);
    const family = await call('families.php', { method: 'POST', authenticated: true, body: { name: 'Famille test', categoryId: 'motos' } });
    assert.equal(family.status, 201);
    const type = await call('product-types.php', { method: 'POST', authenticated: true, body: { name: 'Type test', categoryId: 'motos', familyId: family.body.family.id } });
    assert.equal(type.status, 201);
    assert.equal((await call(`families.php?id=${family.body.family.id}`, { method: 'DELETE', authenticated: true })).status, 409);
    assert.equal((await call(`product-types.php?id=${type.body.productType.id}`, { method: 'DELETE', authenticated: true })).status, 200);
    assert.equal((await call(`families.php?id=${family.body.family.id}`, { method: 'DELETE', authenticated: true })).status, 200);
    const model = await call('models.php', { method: 'POST', authenticated: true, body: { name: 'Modèle test', brandId: 'tvs' } });
    assert.equal(model.status, 201);
    assert.equal((await call(`models.php?id=${model.body.model.id}`, { method: 'DELETE', authenticated: true })).status, 200);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/8l8AAAAASUVORK5CYII=', 'base64');
    const brandInput = new FormData(); brandInput.set('name', 'Marque test'); brandInput.set('isEquipmentBrand', 'true'); brandInput.set('logo', new Blob([png], { type: 'image/png' }), 'logo.png');
    const brand = await call('brands.php', { method: 'POST', authenticated: true, body: brandInput });
    assert.equal(brand.status, 201); assert.ok(brand.body.brand.logo.startsWith('/server/uploads/brands/')); assert.equal(brand.body.brand.isPublished, true); assert.equal(brand.body.brand.isPartner, false);
    const hiddenInput = new FormData(); hiddenInput.set('name', 'Marque cachée test'); hiddenInput.set('isPublished', 'false'); hiddenInput.set('isPartner', 'true'); hiddenInput.set('isEquipmentBrand', 'true'); hiddenInput.set('logo', new Blob([png], { type: 'image/png' }), 'logo.png');
    const hiddenBrand = await call('brands.php', { method: 'POST', authenticated: true, body: hiddenInput });
    assert.equal(hiddenBrand.status, 201); assert.equal(hiddenBrand.body.brand.isPublished, false); assert.equal(hiddenBrand.body.brand.isPartner, true); assert.equal(hiddenBrand.body.brand.isEquipmentBrand, true);
    assert.ok(!(await call('brands.php')).body.brands.some((b) => b.id === hiddenBrand.body.brand.id));
    assert.ok((await call('brands.php?includeDrafts=1', { authenticated: true })).body.brands.some((b) => b.id === hiddenBrand.body.brand.id));
    assert.equal((await call(`brands.php?id=${hiddenBrand.body.brand.id}`, { method: 'DELETE', authenticated: true })).status, 200);
    const updateBrand = new FormData(); updateBrand.set('_method', 'PUT'); updateBrand.set('name', 'Marque test mise à jour'); updateBrand.set('isEquipmentBrand', 'false');
    assert.equal((await call(`brands.php?id=${brand.body.brand.id}`, { method: 'POST', authenticated: true, body: updateBrand })).status, 200);
    const oldLogo = brand.body.brand.logo;
    const oldFile = await fetch(`http://127.0.0.1:${port}${oldLogo}`);
    assert.equal(oldFile.status, 200, 'le logo initial reste présent après une modification sans image');
    assert.deepEqual(Buffer.from(await oldFile.arrayBuffer()), png);
    const updatedLogo = new FormData(); updatedLogo.set('_method', 'PUT'); updatedLogo.set('name', 'Marque test mise à jour'); updatedLogo.set('isEquipmentBrand', 'false'); updatedLogo.set('logo', new Blob([png], { type: 'image/png' }), 'nouveau.png');
    const logoUpdate = await call(`brands.php?id=${brand.body.brand.id}`, { method: 'POST', authenticated: true, body: updatedLogo });
    assert.equal(logoUpdate.status, 200); const newLogo = logoUpdate.body.brand.logo;
    assert.notEqual(newLogo, oldLogo);
    const newFile = await fetch(`http://127.0.0.1:${port}${newLogo}`);
    assert.equal(newFile.status, 200, 'le nouveau logo doit rester disponible après la réponse API');
    assert.deepEqual(Buffer.from(await newFile.arrayBuffer()), png);
    assert.equal((await fetch(`http://127.0.0.1:${port}${oldLogo}`)).status, 200, 'l’ancien logo reste conservé');
    assert.equal((await call('brands.php')).body.brands.find((b) => b.id === brand.body.brand.id).logo, newLogo);
    const invalidLogo = new FormData(); invalidLogo.set('_method', 'PUT'); invalidLogo.set('name', 'Nom ne doit pas changer'); invalidLogo.set('logo', new Blob(['pas une image'], { type: 'image/png' }), 'invalide.png');
    assert.equal((await call(`brands.php?id=${brand.body.brand.id}`, { method: 'POST', authenticated: true, body: invalidLogo })).status, 400);
    const oversize = new FormData(); oversize.set('_method', 'PUT'); oversize.set('name', 'Nom ne doit pas changer'); oversize.set('MAX_FILE_SIZE', '1'); oversize.set('logo', new Blob([png], { type: 'image/png' }), 'trop-grand.png');
    assert.equal((await call(`brands.php?id=${brand.body.brand.id}`, { method: 'POST', authenticated: true, body: oversize })).status, 413);
    const stillBrand = (await call('brands.php')).body.brands.find((b) => b.id === brand.body.brand.id);
    assert.equal(stillBrand.name, 'Marque test mise à jour'); assert.equal(stillBrand.logo, newLogo);
    assert.equal((await fetch(`http://127.0.0.1:${port}${newLogo}`)).status, 200, 'un échec de transfert préserve le logo et les données');
    assert.equal((await call(`brands.php?id=${brand.body.brand.id}`, { method: 'DELETE', authenticated: true })).status, 200);
    const product = { name: 'Moto test intégration', brandId: 'tvs', categoryId: 'motos', productTypeId: 'urbain', description: 'Essai', images: [], specifications: [] };
    const form = new FormData(); form.set('product', JSON.stringify(product)); form.set('mainImage', new Blob([png], { type: 'image/png' }), 'test.png');
    const createdProduct = await call('products/motorcycles.php', { method: 'POST', authenticated: true, body: form });
    assert.equal(createdProduct.status, 201); assert.equal(createdProduct.body.data.status, 'DRAFT');
    const id = createdProduct.body.data.id;
    const imageUrl = createdProduct.body.data.images[0].url;
    const selection = await call('homepage-selections.php', { method: 'PUT', authenticated: true, body: { id, categoryId: 'motos', field: 'isNewArrival', value: true } });
    assert.equal(selection.status, 200); assert.equal(selection.body.data.isNewArrival, true);
    const { isNewArrival: ignoredBefore, ...beforeSelection } = createdProduct.body.data;
    const { isNewArrival: ignoredAfter, ...afterSelection } = selection.body.data;
    assert.deepEqual(afterSelection, beforeSelection, 'les autres données du produit ne sont pas modifiées');
    assert.ok(!(await call('products/motorcycles.php')).body.data.some((p) => p.id === id), 'le brouillon sélectionné reste privé');
    assert.equal((await call('homepage-selections.php', { method: 'PUT', authenticated: true, body: { id, categoryId: 'motos', field: 'status', value: true } })).status, 400);
    assert.equal((await call('homepage-selections.php', { method: 'PUT', authenticated: true, body: { id, categoryId: 'motos', field: 'isEquipementAccueil', value: true } })).status, 400);
    assert.equal((await call('homepage-selections.php', { method: 'PUT', authenticated: true, body: { id, categoryId: 'motos', field: 'isNewArrival', value: 'false' } })).status, 400);
    assert.equal((await call('homepage-selections.php', { method: 'PUT', authenticated: true, body: { id: 'inconnu', categoryId: 'motos', field: 'isNewArrival', value: false } })).status, 404);
    assert.equal((await call('homepage-selections.php', { method: 'PUT', authenticated: true, body: { id, categoryId: 'motos', field: 'isNewArrival', value: false } })).status, 200);
    const invalidImage = new FormData(); invalidImage.set('_method', 'PUT'); invalidImage.set('product', JSON.stringify({ description: 'Ne pas sauvegarder' })); invalidImage.set('mainImage', new Blob(['pas une image'], { type: 'image/png' }), 'test.png');
    assert.equal((await call(`products/motorcycles.php?id=${id}`, { method: 'POST', authenticated: true, body: invalidImage })).status, 400);
    const stillDraft = await call(`products/motorcycles.php?id=${id}&includeDrafts=1`, { authenticated: true });
    assert.equal(stillDraft.body.data.images[0].url, imageUrl);
    assert.equal(stillDraft.body.data.description, 'Essai');
    assert.ok(existsSync(join(dir, imageUrl)));
    assert.ok(!(await call('products/motorcycles.php')).body.data.some((p) => p.id === id));
    assert.ok((await call('products/motorcycles.php?includeDrafts=1', { authenticated: true })).body.data.some((p) => p.id === id));
    assert.equal((await call(`products/motorcycles.php?id=${id}`, { method: 'PUT', authenticated: true, body: { productTypeId: 'bottes' } })).status, 400);
    const update = new FormData(); update.set('_method', 'PUT'); update.set('product', JSON.stringify({ status: 'PUBLISHED' }));
    assert.equal((await call(`products/motorcycles.php?id=${id}`, { method: 'POST', authenticated: true, body: update })).status, 200);
    assert.ok((await call('products/motorcycles.php')).body.data.some((p) => p.id === id));
    assert.equal((await call(`products/motorcycles.php?id=${id}`, { method: 'DELETE', authenticated: true })).status, 200);
    for (const [path, categoryId, productTypeId] of [['motorcycles', 'motos', 'urbain'], ['helmets', 'casques', 'casque'], ['riding-gear', 'equipements', 'gants'], ['spare-parts', 'pieces-detachees', 'pneus']]) {
      const input = new FormData();
      input.set('product', JSON.stringify({ name: `Test ${path}`, brandId: 'tvs', categoryId, productTypeId, description: '', images: [], specifications: [], isEquipementAccueil: path === 'helmets' }));
      input.set('mainImage', new Blob([png], { type: 'image/png' }), 'test.png');
      input.append('gallery[]', new Blob([png], { type: 'image/png' }), 'galerie.png');
      const created = await call(`products/${path}.php`, { method: 'POST', authenticated: true, body: input });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.data.status, 'DRAFT');
      assert.ok(created.body.data.images[0].url.startsWith('/server/uploads/'));
      assert.equal(created.body.data.images.length, 2);
      const [originalMain, galleryImage] = created.body.data.images;
      const chooseExisting = new FormData(); chooseExisting.set('_method', 'PUT');
      chooseExisting.set('product', JSON.stringify({ images: [{ ...galleryImage, isMain: true, position: 0 }, { ...originalMain, isMain: false, position: 1 }] }));
      const chosen = await call(`products/${path}.php?id=${created.body.data.id}`, { method: 'POST', authenticated: true, body: chooseExisting });
      assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
      assert.equal(chosen.body.data.images[0].url, galleryImage.url);
      assert.equal(chosen.body.data.images[0].isMain, true);
      const chooseNew = new FormData(); chooseNew.set('_method', 'PUT');
      chooseNew.set('product', JSON.stringify({ images: chosen.body.data.images.map((image, index) => ({ ...image, isMain: false, position: index + 1 })) }));
      chooseNew.set('mainImage', new Blob([png], { type: 'image/png' }), 'nouvelle.png');
      const changed = await call(`products/${path}.php?id=${created.body.data.id}`, { method: 'POST', authenticated: true, body: chooseNew });
      assert.equal(changed.status, 200, JSON.stringify(changed.body));
      assert.equal(changed.body.data.images.length, 3);
      assert.equal(changed.body.data.images.filter((image) => image.isMain).length, 1);
      assert.ok(changed.body.data.images.some((image) => image.url === originalMain.url));
      assert.ok(changed.body.data.images.some((image) => image.url === galleryImage.url));
      assert.equal(new Set(changed.body.data.images.map((image) => image.id)).size, 3);
      const publish = new FormData(); publish.set('_method', 'PUT'); publish.set('product', JSON.stringify({ status: 'PUBLISHED' }));
      assert.equal((await call(`products/${path}.php?id=${created.body.data.id}`, { method: 'POST', authenticated: true, body: publish })).status, 200);
      if (path === 'helmets') assert.ok((await call('homepage-equipment.php')).body.data.length <= 4);
      assert.equal((await call(`products/${path}.php?id=${created.body.data.id}`, { method: 'DELETE', authenticated: true })).status, 200);
    }
    assert.equal((await call('auth/logout.php', { method: 'POST', authenticated: true })).status, 200);
    assert.equal((await call('products/motorcycles.php?includeDrafts=1', { authenticated: true })).status, 401);
    for (let i = 0; i < 5; i++) assert.equal((await call('auth/login.php', { method: 'POST', body: { username: 'test-admin', password: 'incorrect' } })).status, 401);
    assert.equal((await call('auth/login.php', { method: 'POST', body: { username: 'test-admin', password: 'incorrect' } })).status, 429);
    // Le dépôt de départ ne doit pas être modifié par les tests.
    assert.ok(readFileSync(join(serverDir, 'storage/data/products/motorcycles.json'), 'utf8').includes('tvs-125-hlx-5g'));
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => { if (child.exitCode !== null) r(); else { child.once('exit', r); setTimeout(r, 1000); } });
    rmSync(dir, { recursive: true, force: true });
  }
});

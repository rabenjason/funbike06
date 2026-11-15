import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Garde-fou : chaque formulaire du dashboard qui envoie un fichier image
// doit passer par l'optimisation locale avant sa requête.
test('tous les formulaires d’images du dashboard utilisent une optimisation locale', () => {
  const files = ['Admin.tsx', 'AdminSiteLogo.tsx', 'AdminShercoBanner.tsx', 'AdminPromotions.tsx', 'AdminChatbot.tsx'];
  const forms = readdirSync('src/pages').filter(name => /\.tsx$/.test(name) && /type="file"/.test(readFileSync(`src/pages/${name}`, 'utf8')));
  assert.deepEqual(forms.sort(), [...files].sort(), 'tout nouveau formulaire de fichier doit être vérifié');
  for (const name of files) {
    const source = readFileSync(`src/pages/${name}`, 'utf8');
    assert.match(source, /optimizeProductImage|useImageOptimization/, name);
    assert.match(source, /avant l’envoi|optimis[ée].*(?:avant|puis)|nouvelles photos sont optimisées/, name);
  }
});

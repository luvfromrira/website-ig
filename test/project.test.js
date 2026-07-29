import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '..');

test('the index uses external CSS and JavaScript with valid local references', () => {
  const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');

  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.doesNotMatch(html, /<script>(?:.|\n)*?<\/script>/i);

  const localReferences = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)]
    .map(([, path]) => path)
    .filter((path) => !/^(?:https?:|data:)/.test(path));

  for (const path of localReferences) {
    assert.ok(existsSync(resolve(projectRoot, path.replace(/^\//, ''))), `Missing ${path}`);
  }
});

test('every relative JavaScript import resolves', () => {
  const entry = resolve(projectRoot, 'assets/js/app.js');
  const visited = new Set();

  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g)) {
      const specifier = match[1] ?? match[2];
      const imported = resolve(dirname(file), specifier);
      assert.ok(existsSync(imported), `Missing import ${specifier} from ${file}`);
      visit(imported);
    }
  }

  visit(entry);
  assert.equal(visited.size, 6);
});

test('all normal and shiny sprite variants are present', () => {
  const ids = [87, 147, 197, 319, 334, 363, 403, 470, 570, 585, 586];

  for (const id of ids) {
    for (const variant of ['', 'shiny/']) {
      for (const extension of ['gif', 'png']) {
        const path = resolve(projectRoot, `assets/sprites/${variant}${id}.${extension}`);
        assert.ok(existsSync(path), `Missing ${path}`);
      }
    }
  }
});

test('the Discord presence is a profile link with an inline logo', () => {
  const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
  const presence = html.match(/<a class="presence"[\s\S]*?<\/a>/)?.[0] || '';

  assert.match(presence, /href="https:\/\/discord\.com\/users\/1190070053920591947"/);
  assert.match(presence, /class="presence-profile"/);
  assert.match(presence, /<svg[^>]*viewBox="0 0 24 24"/);
});

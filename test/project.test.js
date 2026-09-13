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
  assert.equal(visited.size, 7);
});

test('every sprite the page asks for exists in the variant it asks for', () => {
  const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
  const page = readFileSync(resolve(projectRoot, 'assets/js/page.js'), 'utf8');

  // The dex map in page.js is the only place an id lives, so read it from there
  // rather than restating it here — otherwise this test goes stale the moment a
  // pokémon is added to or removed from the lists.
  const pokedex = Object.fromEntries(
    [...page.match(/const POKEDEX = \{([\s\S]*?)\};/)[1]
      .matchAll(/(\w+):\s*(\d+)/g)].map(([, name, id]) => [name, Number(id)]),
  );
  assert.ok(Object.keys(pokedex).length > 0, 'POKEDEX did not parse');

  // Each list only ever renders one variant, so only that variant must exist.
  const lists = [...html.matchAll(/<ul[^>]*data-sprites="(normal|shiny)"[\s\S]*?<\/ul>/g)];
  assert.equal(lists.length, 2);

  let checked = 0;
  for (const [list, variant] of lists) {
    const prefix = variant === 'shiny' ? 'shiny/' : '';
    for (const [, name] of list.matchAll(/<li>([^<]+)<\/li>/g)) {
      const id = pokedex[name.trim().toLowerCase()];
      if (id === undefined) continue; // named but unmapped: renders as a plain pill
      for (const extension of ['gif', 'png']) {
        const path = resolve(projectRoot, `assets/sprites/${prefix}${id}.${extension}`);
        assert.ok(existsSync(path), `Missing ${path} (${variant} ${name.trim()})`);
        checked++;
      }
    }
  }

  assert.ok(checked > 0, 'no sprites were checked');
});

test('the Discord presence is a profile link with an inline logo', () => {
  const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
  const presence = html.match(/<a class="presence"[\s\S]*?<\/a>/)?.[0] || '';

  assert.match(presence, /href="https:\/\/discord\.com\/users\/1190070053920591947"/);
  assert.match(presence, /class="presence-profile"/);
  assert.match(presence, /<svg[^>]*viewBox="0 0 24 24"/);
});

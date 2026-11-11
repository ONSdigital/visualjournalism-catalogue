import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTaxonomy, matchesTaxonomy, normalizeTaxonomy, taxonomyState, toggleTaxonomy } from '../src/lib/taxonomy-filter.js';

const releases = [
  { theme: 'economy', topic: 'accounts', subtopic: 'output' },
  { theme: 'economy', topic: 'accounts', subtopic: null },
  { theme: 'economy', topic: 'prices', subtopic: 'output' },
  { theme: 'people', topic: 'accounts', subtopic: 'output' }
];
const roots = buildTaxonomy(releases);
const all = { mode: 'exclude', paths: [] };

test('all selected includes missing levels and distinguishes full paths', () => {
  assert.equal(releases.filter(release => matchesTaxonomy(release, all)).length, 4);
  const selection = { mode: 'exclude', paths: ['economy/accounts/output'] };
  assert.deepEqual(releases.map(release => matchesTaxonomy(release, selection)), [false, true, true, true]);
  assert.equal(roots.find(node => node.path === 'economy').leafPaths.length, 3);
});

test('partial children produce mixed parents and reselecting parent restores every child', () => {
  const economy = roots.find(node => node.path === 'economy');
  const partial = toggleTaxonomy(roots, all, 'economy/accounts/output', false);
  assert.deepEqual(taxonomyState(economy, partial), { checked: false, mixed: true, selected: 2 });
  assert.deepEqual(toggleTaxonomy(roots, partial, 'economy', true), all);
  const emptyBranch = toggleTaxonomy(roots, partial, 'economy', false);
  assert.deepEqual(taxonomyState(economy, emptyBranch), { checked: false, mixed: false, selected: 0 });
});

test('empty selection stays empty and compact encoding is independent of click order', () => {
  let selection = all;
  for (const node of roots) selection = toggleTaxonomy(roots, selection, node.path, false);
  assert.deepEqual(selection, { mode: 'include', paths: [] });
  assert.equal(releases.filter(release => matchesTaxonomy(release, selection)).length, 0);
  const forward = toggleTaxonomy(roots, toggleTaxonomy(roots, all, 'economy/accounts', false), 'people', false);
  const reverse = toggleTaxonomy(roots, toggleTaxonomy(roots, all, 'people', false), 'economy/accounts', false);
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward, { mode: 'exclude', paths: ['economy/accounts', 'people'] });
  const manyRoots = buildTaxonomy(['a', 'long-theme-one', 'long-theme-two', 'long-theme-three'].map(theme => ({ theme })));
  let sparse = all;
  for (const node of manyRoots.filter(node => node.path !== 'a')) {
    sparse = toggleTaxonomy(manyRoots, sparse, node.path, false);
  }
  assert.deepEqual(sparse, { mode: 'include', paths: ['a'] });
});

test('normalization removes redundant branches without treating invalid include paths as all', () => {
  assert.deepEqual(normalizeTaxonomy({ paths: ['economy/accounts', 'economy', 'economy', '../bad'] }), {
    mode: 'exclude', paths: ['economy']
  });
  assert.equal(matchesTaxonomy(releases[0], { mode: 'include', paths: ['unknown'] }), false);
});
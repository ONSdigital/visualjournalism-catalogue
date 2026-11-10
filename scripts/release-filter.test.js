import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesReleaseView, readReleaseView, releaseViewUrl } from '../src/lib/release-filter.js';

const releases = [
  { doc_uri: '/older', series: 'GDP', latest: false },
  { doc_uri: '/latest', series: 'GDP', latest: true },
  { doc_uri: '/tied', series: 'GDP', latest: true },
  { doc_uri: '/single', series: 'Pay', latest: true },
  { doc_uri: '/missing', series: 'GDP' },
  { doc_uri: '/string', series: 'GDP', latest: 'true' }
];

test('defaults to explicitly tagged latest releases, preserving ties and order', () => {
  assert.deepEqual(releases.filter(release => matchesReleaseView(release)).map(release => release.doc_uri), ['/latest', '/tied', '/single']);
});

test('includes all history only when latest-only is disabled', () => {
  assert.deepEqual(releases.filter(release => matchesReleaseView(release, { showOnlyLatest: false })), releases);
});

test('matches exact series without title-based or fuzzy grouping', () => {
  const original = structuredClone(releases);
  assert.equal(releases.filter(release => matchesReleaseView(release, { series: 'GDP', showOnlyLatest: false })).length, 5);
  assert.equal(releases.filter(release => matchesReleaseView(release, { series: 'GDP' })).length, 2);
  for (const series of ['gdp', 'GDP ', 'Unknown']) {
    assert.equal(releases.filter(release => matchesReleaseView(release, { series })).length, 0);
  }
  assert.deepEqual(releases, original);
});

test('reads latest-only defaults and explicit URL overrides', () => {
  for (const query of ['', 'series=', 'series=+++', 'latest=invalid']) {
    assert.deepEqual(readReleaseView(new URLSearchParams(query)), { series: '', showOnlyLatest: true });
  }
  assert.deepEqual(readReleaseView(new URLSearchParams('series=GDP')), { series: 'GDP', showOnlyLatest: false });
  assert.equal(readReleaseView(new URLSearchParams('series=GDP&latest=true')).showOnlyLatest, true);
  assert.equal(readReleaseView(new URLSearchParams('series=GDP&latest=invalid')).showOnlyLatest, false);
  assert.equal(readReleaseView(new URLSearchParams('latest=false')).showOnlyLatest, false);
});

test('series URLs encode special characters and preserve base paths and unrelated parameters', () => {
  const current = new URL('https://example.test/catalogue/?other=value&latest=false#results');
  for (const series of ['Pay & income + costs: UK, 2025', ' GDP ', 'Caf\u00e9']) {
    const href = releaseViewUrl(current, { series });
    const target = new URL(href, current);
    assert.equal(target.pathname, '/catalogue/');
    assert.equal(target.searchParams.get('other'), 'value');
    assert.equal(target.hash, '');
    assert.deepEqual(readReleaseView(target.searchParams), { series, showOnlyLatest: false });
    assert.equal(target.searchParams.has('latest'), false);
  }
  assert.equal(current.searchParams.get('latest'), 'false');
});

test('latest toggles keep series context and returning to catalogue restores the default', () => {
  const current = new URL('https://example.test/catalogue/?series=GDP');
  const latestUrl = new URL(releaseViewUrl(current, { series: 'GDP', showOnlyLatest: true }), current);
  assert.deepEqual(readReleaseView(latestUrl.searchParams), { series: 'GDP', showOnlyLatest: true });
  const catalogueUrl = new URL(releaseViewUrl(latestUrl), current);
  assert.equal(catalogueUrl.search, '');
  assert.deepEqual(readReleaseView(catalogueUrl.searchParams), { series: '', showOnlyLatest: true });
});
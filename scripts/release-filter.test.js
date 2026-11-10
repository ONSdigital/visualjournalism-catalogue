import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogueFiltersUrl, matchesReleaseView, readCatalogueFilters, readReleaseView, releaseViewUrl } from '../src/lib/release-filter.js';

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

const topicIds = ['economy', 'employmentandlabourmarket', 'peoplepopulationandcommunity'];

test('reads complete default filters and normalizes known topics', () => {
  assert.deepEqual(readCatalogueFilters(new URLSearchParams(), topicIds), {
    series: '', showOnlyLatest: true, search: '', topicIds: [], from: '', to: ''
  });
  const params = new URLSearchParams('topic=unknown&topic=employmentandlabourmarket&topic=economy&topic=economy&q=++GDP++');
  const filters = readCatalogueFilters(params, topicIds);
  assert.deepEqual(filters.topicIds, topicIds.slice(0, 2));
  assert.equal(filters.search, 'GDP');
});

test('round-trips combined filters without losing operators or special characters', () => {
  const current = new URL('https://example.test/onsvj-catalogue/?other=value#results');
  const filters = {
    search: '"Pay & income" OR costs + prices', topicIds: topicIds.slice(0, 2),
    from: '2024-02-29', to: '2025-01-31', series: 'Caf\u00e9 & costs + UK', showOnlyLatest: true
  };
  const target = new URL(catalogueFiltersUrl(current, filters, topicIds), current);
  assert.equal(target.pathname, '/onsvj-catalogue/');
  assert.equal(target.searchParams.get('other'), 'value');
  assert.equal(target.hash, '');
  assert.deepEqual(readCatalogueFilters(target.searchParams, topicIds), filters);
  assert.equal(current.searchParams.has('q'), false);
});

test('rejects invalid URL date ranges as a whole and accepts inclusive single bounds', () => {
  for (const query of ['from=2023-02-29', 'from=2024-01-01&to=bad', 'from=2025-01-02&to=2025-01-01', 'from=01/01/2025', 'from=0000-01-01']) {
    const filters = readCatalogueFilters(new URLSearchParams(query), topicIds);
    assert.equal(filters.from, '');
    assert.equal(filters.to, '');
  }
  assert.equal(readCatalogueFilters(new URLSearchParams('from=2024-02-29'), topicIds).from, '2024-02-29');
  assert.equal(readCatalogueFilters(new URLSearchParams('to=2025-01-01'), topicIds).to, '2025-01-01');
});

test('series and default destinations explicitly clear every other managed filter', () => {
  const current = new URL('https://example.test/?q=GDP&topic=economy&from=2024-01-01&to=2025-01-01&latest=false&other=value');
  const target = new URL(catalogueFiltersUrl(current, { series: 'GDP' }, topicIds), current);
  assert.deepEqual(readCatalogueFilters(target.searchParams, topicIds), {
    series: 'GDP', showOnlyLatest: false, search: '', topicIds: [], from: '', to: ''
  });
  const defaults = new URL(catalogueFiltersUrl(target, {}, topicIds), target);
  assert.equal(defaults.search, '?other=value');
});

test('canonical URLs omit defaults, unknown topics and invalid dates', () => {
  const current = new URL('https://example.test/');
  const href = catalogueFiltersUrl(current, {
    search: '   ', topicIds: ['unknown', 'economy', 'economy'], from: 'bad', to: '2025-01-01'
  }, topicIds);
  assert.equal(href, '/?topic=economy');
  assert.equal(catalogueFiltersUrl(current, {}, topicIds), '/');
});

test('all-editions search uses the series title and clears other filters', () => {
  const current = new URL('https://example.test/onsvj-catalogue/?series=Old&q=previous&topic=economy&from=2024-01-01&to=2025-01-01&latest=true&other=value');
  const series = 'Pay & income + costs: UK';
  const target = new URL(catalogueFiltersUrl(current, {
    search: series, showOnlyLatest: false
  }, topicIds), current);

  assert.deepEqual(readCatalogueFilters(target.searchParams, topicIds), {
    series: '', search: series, showOnlyLatest: false, topicIds: [], from: '', to: ''
  });
  assert.equal(target.searchParams.has('series'), false);
  assert.equal(target.searchParams.get('q'), series);
  assert.equal(target.searchParams.get('latest'), 'false');
  assert.equal(target.searchParams.get('other'), 'value');
  assert.equal(target.pathname, '/onsvj-catalogue/');
});
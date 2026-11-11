import { validateDateRange } from './date-filter.js';

export function readReleaseView(params) {
  const value = params.get('series');
  const series = value?.trim() ? value : '';
  const latest = params.get('latest');
  const showOnlyLatest = latest === 'true' || (latest !== 'false' && !series);
  return { series, showOnlyLatest };
}

export function matchesReleaseView(release, { series = '', releaseUri = '', showOnlyLatest = true } = {}) {
  return (!series || release.series === series) && (!releaseUri || release.doc_uri === releaseUri)
    && (!showOnlyLatest || release.latest === true);
}

export function chartTypeId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'unclassified';
}

export function matchingCharts(release, chartTypes = []) {
  return (release.vis || []).map((chart, index) => ({ chart, index }))
    .filter(({ chart }) => !chartTypes.length || chartTypes.includes(chartTypeId(chart.chart_type)));
}

export function releaseViewUrl(currentUrl, { series = '', showOnlyLatest = !series } = {}) {
  const url = new URL(currentUrl);
  url.hash = '';
  if (series) url.searchParams.set('series', series);
  else url.searchParams.delete('series');
  if (showOnlyLatest === !series) url.searchParams.delete('latest');
  else url.searchParams.set('latest', String(showOnlyLatest));
  return `${url.pathname}${url.search}`;
}

export function readCatalogueFilters(params, knownTopicIds = []) {
  const dateInput = value => {
    if (!value) return '';
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : 'invalid';
  };
  const range = validateDateRange(dateInput(params.get('from')), dateInput(params.get('to')));
  const selectedIds = new Set(params.getAll('topic'));
  return {
    ...readReleaseView(params),
    search: (params.get('q') || '').trim(),
    topicIds: knownTopicIds.filter(id => selectedIds.has(id)),
    chartTypes: [...new Set(params.getAll('chartType').map(value => value.trim()).filter(Boolean))].sort(),
    releaseUri: params.get('release')?.trim() ? params.get('release') : '',
    openAll: params.get('openAll') === 'true',
    from: range.valid ? range.from : '',
    to: range.valid ? range.to : ''
  };
}

export function catalogueFiltersUrl(currentUrl, {
  search = '', topicIds = [], chartTypes = [], releaseUri = '', openAll = false,
  from = '', to = '', series = '', showOnlyLatest = !series
} = {}, knownTopicIds = []) {
  const url = new URL(releaseViewUrl(currentUrl, { series, showOnlyLatest }), currentUrl);
  for (const key of ['q', 'topic', 'chartType', 'release', 'openAll', 'from', 'to']) url.searchParams.delete(key);
  if (search.trim()) url.searchParams.set('q', search.trim());
  for (const id of topicIds) url.searchParams.append('topic', id);
  for (const id of [...new Set(chartTypes.map(value => value.trim()).filter(Boolean))].sort()) {
    url.searchParams.append('chartType', id);
  }
  if (releaseUri.trim()) url.searchParams.set('release', releaseUri);
  if (openAll) url.searchParams.set('openAll', 'true');
  if (from) url.searchParams.set('from', from);
  if (to) url.searchParams.set('to', to);

  const normalized = readCatalogueFilters(url.searchParams, knownTopicIds);
  url.searchParams.delete('topic');
  for (const id of normalized.topicIds) url.searchParams.append('topic', id);
  for (const key of ['from', 'to']) {
    if (normalized[key]) url.searchParams.set(key, normalized[key]);
    else url.searchParams.delete(key);
  }
  if (!normalized.series) url.searchParams.delete('series');
  return `${url.pathname}${url.search}`;
}
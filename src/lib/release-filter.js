export function readReleaseView(params) {
  const value = params.get('series');
  const series = value?.trim() ? value : '';
  const latest = params.get('latest');
  const showOnlyLatest = latest === 'true' || (latest !== 'false' && !series);
  return { series, showOnlyLatest };
}

export function matchesReleaseView(release, { series = '', showOnlyLatest = true } = {}) {
  return (!series || release.series === series) && (!showOnlyLatest || release.latest === true);
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
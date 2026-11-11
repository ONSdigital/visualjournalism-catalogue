<script>
  import { Embed, Input, Button, Checkbox, Accordion, AccordionItem, Checkboxes, DocumentList, Details } from '@onsvisual/svelte-components';
  import { onMount, untrack } from 'svelte';
  import { browser } from '$app/environment';
  import { beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import * as d3 from 'd3';
  import { validateDateRange, matchesDateRange } from '$lib/date-filter.js';
  import { catalogueFiltersUrl, chartTypeId, matchingCharts, matchesReleaseView, readCatalogueFilters } from '$lib/release-filter.js';

  const topics = [
    { id: 'economy', label: 'Economy', checked: false },
    { id: 'employmentandlabourmarket', label: 'Employment and labour market', checked: false },
    { id: 'peoplepopulationandcommunity', label: 'People, population and community', checked: false }
  ];
  const screenshotBase = 'https://raw.githubusercontent.com/ONSdigital/get-ons-vis-screenshots/main/screenshots/';
  const knownTopicIds = topics.map(topic => topic.id);

  let data = $state([]);
  let editionCounts = $derived.by(() => {
    const counts = new Map();
    for (const release of data) {
      counts.set(release.series, (counts.get(release.series) || 0) + 1);
    }
    return counts;
  });
  let screenshots = $state({});
  let mounted = $state(false);
  let loadError = $state(false);
  let searchInputText = $state('');
  let chartTypeSearch = $state('');
  let expandedRelease = $state(null);
  let showNumber = $state(18);
  let datefrom = $state('');
  let dateto = $state('');
  let dateTouched = $state({ from: false, to: false });
  let dateRange = $derived(validateDateRange(datefrom, dateto));
  let filters = $derived(readCatalogueFilters(browser ? $page.url.searchParams : new URLSearchParams(), knownTopicIds));
  let filterSignature = $derived.by(() => {
    const { openAll, ...matchingFilters } = filters;
    return JSON.stringify(matchingFilters);
  });
  let openAll = $derived(filters.openAll);
  let showOnlyLatest = $derived(filters.showOnlyLatest);
  let topicItems = $derived(topics.map(topic => ({ ...topic, checked: filters.topicIds.includes(topic.id) })));
  let chartTypeItems = $derived.by(() => {
    const ids = new Set(filters.chartTypes);
    for (const release of data) {
      for (const chart of release.vis || []) ids.add(chartTypeId(chart.chart_type));
    }
    return [...ids].map(id => {
      const text = id === 'unclassified' ? 'Not classified' : id.replaceAll('-', ' ');
      return { id, label: text.charAt(0).toUpperCase() + text.slice(1), checked: filters.chartTypes.includes(id) };
    }).sort((first, second) => first.label.localeCompare(second.label));
  });
  let visibleChartTypeItems = $derived(chartTypeItems.filter(item => item.label.toLowerCase().includes(chartTypeSearch.trim().toLowerCase())));
  let desiredFilters = null;
  let navigationQueue = Promise.resolve();
  let navigationVersion = 0;

  $effect(() => {
    filterSignature;
    const restored = untrack(() => filters);
    searchInputText = restored.search;
    datefrom = restored.from.split('-').reverse().join('/');
    dateto = restored.to.split('-').reverse().join('/');
    dateTouched = { from: false, to: false };
    showNumber = 18;
    expandedRelease = null;
  });

  $effect(() => {
    openAll;
    expandedRelease = null;
  });

  beforeNavigate(({ type }) => {
    if (type !== 'goto') {
      navigationVersion += 1;
      desiredFilters = null;
      navigationQueue = Promise.resolve();
    }
  });

  onMount(async () => {
    try {
      const res = await fetch('https://raw.githubusercontent.com/ONSdigital/onsvisualjournalism-backend/main/data.json');
      if (!res.ok) throw new Error('Unable to load releases');
      data = await res.json();
      if (data.length && !data.some(release => typeof release.latest === 'boolean')) {
        throw new Error('Release data is missing latest-edition tags');
      }

      const res2 = await fetch('https://raw.githubusercontent.com/ONSdigital/get-ons-vis-screenshots/main/screenshot-filenames.json');
      if (res2.ok) screenshots = await res2.json();
    } catch {
      loadError = true;
    } finally {
      mounted = true;
    }
  });

  let releaseResults = $derived.by(() => {
    let matchedReleases = data;

    if (filters.search) {
      const tokens = [];
      const regex = /"([^"]+)"|(\S+)/g;
      let match;
      while ((match = regex.exec(filters.search)) !== null) {
        tokens.push(match[1] || match[2]);
      }

      const hasOr = tokens.includes('OR');
      const searchTerms = tokens.filter(term => term !== 'OR' && term !== 'AND');
      matchedReleases = data.filter(release => {
        const title = release.title.toLowerCase();
        return hasOr
          ? searchTerms.some(term => title.includes(term.toLowerCase()))
          : searchTerms.every(term => title.includes(term.toLowerCase()));
      }).sort((first, second) => new Date(second.release_date) - new Date(first.release_date));
    }

    if (filters.topicIds.length) {
      matchedReleases = matchedReleases.filter(release => filters.topicIds.includes(release.theme));
    }

    return matchedReleases.filter(release =>
      matchesReleaseView(release, filters) && matchesDateRange(release.release_date, filters)
    ).map(release => ({ release, charts: matchingCharts(release, filters.chartTypes) }))
      .filter(result => !filters.chartTypes.length || result.charts.length);
  });
  let matchingChartCount = $derived(releaseResults.reduce((count, result) => count + result.charts.length, 0));

  function commitFilters(patch, disclosureOnly = false) {
    const current = desiredFilters || filters;
    const href = catalogueFiltersUrl($page.url, {
      ...current,
      ...(disclosureOnly ? {} : { releaseUri: '', openAll: false }),
      ...patch
    }, knownTopicIds);
    const next = readCatalogueFilters(new URL(href, $page.url).searchParams, knownTopicIds);
    if (JSON.stringify(next) === JSON.stringify(current)) return;

    desiredFilters = next;
    const version = navigationVersion;
    navigationQueue = navigationQueue.catch(() => {}).then(async () => {
      if (version !== navigationVersion) return;
      try {
        await goto(href, { keepFocus: true, noScroll: true });
      } finally {
        if (desiredFilters === next) desiredFilters = null;
      }
    });
    return navigationQueue;
  }

  function setTopic(item) {
    const selectedIds = new Set((desiredFilters || filters).topicIds);
    if (item.checked) selectedIds.add(item.id);
    else selectedIds.delete(item.id);
    return commitFilters({ topicIds: [...selectedIds] });
  }

  function applyDates(field, event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    dateTouched[field] = true;
    if (dateRange.valid) return commitFilters({ from: dateRange.from, to: dateRange.to });
  }

  function setChartType(item) {
    const selectedIds = new Set((desiredFilters || filters).chartTypes);
    if (item.checked) selectedIds.add(item.id);
    else selectedIds.delete(item.id);
    return commitFilters({ chartTypes: [...selectedIds] });
  }

  function screenshotUrl(url) {
    const filename = screenshots[url];
    return filename ? `${screenshotBase}${filename}.png` : null;
  }

  function toggleRelease(release, event) {
    const isOpen = event.detail.e.target.open;
    if (isOpen === (openAll || expandedRelease === release)) return;
    if (openAll) {
      if (!isOpen) {
        expandedRelease = null;
        commitFilters({ openAll: false }, true);
      }
      return;
    }

    if (isOpen) expandedRelease = release;
    else if (expandedRelease === release) expandedRelease = null;
  }
</script>

<svelte:head>
  <title>Visual journalism catalogue - ONS</title>
</svelte:head>

<Embed>
  <main class="catalogue">
    <h1 class="ons-u-fs-xl">Visual journalism catalogue</h1>

    {#if !mounted}
      <p role="status">Loading releases...</p>
    {:else if loadError}
      <p role="alert">Releases could not be loaded. Please refresh the page to try again.</p>
    {:else}
      <form class="catalogue-search" role="search" onsubmit={event => { event.preventDefault(); commitFilters({ search: searchInputText }); }}>
        <Input id="release-search" label="Search release titles" bind:value={searchInputText} />
        <Button type="submit" icon="search">Search</Button>
      </form>

      <div class="catalogue-filters">
        <Accordion>
          <AccordionItem title="Filter releases">
            <Checkbox
              id="latest-only"
              label="Show only latest edition"
              item={{ id: 'latest-only', label: 'Show only latest edition', checked: showOnlyLatest }}
              on:change={event => commitFilters({ showOnlyLatest: event.detail.item.checked })}
            />
            <div class="catalogue-topics">
              <Checkboxes items={topicItems} title="Topics" on:change={event => setTopic(event.detail.item)} />
            </div>
            <div class="catalogue-chart-types">
              <Details title={`Chart types${filters.chartTypes.length ? ` (${filters.chartTypes.length} selected)` : ''}`} headingTag="h3">
                <Input id="chart-type-search" label="Find a chart type" bind:value={chartTypeSearch} />
                <div class="catalogue-chart-type-options">
                  <Checkboxes items={visibleChartTypeItems} title="Chart types" hideTitle on:change={event => setChartType(event.detail.item)} />
                </div>
                {#if !visibleChartTypeItems.length}<p>No chart types match.</p>{/if}
              </Details>
            </div>
            <div class="catalogue-dates">
              <div onfocusout={event => applyDates('from', event)}>
                <Input
                  id="datefrom"
                  label="Date from"
                  description={dateTouched.from && dateRange.errors.from ? dateRange.errors.from : 'E.g. 21/03/2022'}
                  error={dateTouched.from && Boolean(dateRange.errors.from)}
                  bind:value={datefrom}
                />
              </div>
              <div onfocusout={event => applyDates('to', event)}>
                <Input
                  id="dateto"
                  label="Date to"
                  description={dateTouched.to && dateRange.errors.to ? dateRange.errors.to : 'E.g. 21/03/2022'}
                  error={dateTouched.to && Boolean(dateRange.errors.to)}
                  bind:value={dateto}
                />
              </div>
            </div>
          </AccordionItem>
        </Accordion>
      </div>

      <section aria-labelledby="results-heading">
        <div class="catalogue-results-toolbar">
          <div>
            <h2 id="results-heading" class="ons-u-fs-l" aria-live="polite" aria-atomic="true">
              {releaseResults.length} {releaseResults.length === 1 ? 'release' : 'releases'}
              {#if filters.chartTypes.length}
                <span class="catalogue-matching-count">containing {matchingChartCount} matching {matchingChartCount === 1 ? 'chart' : 'charts'}</span>
              {/if}
            </h2>
            {#if releaseResults.length}
              <p class="catalogue-result-count">Showing {Math.min(showNumber, releaseResults.length)} of {releaseResults.length}</p>
            {/if}
          </div>
          {#if releaseResults.length}
            <Checkbox id="open-all" label="Open all returned releases" item={{ id: 'open-all', label: 'Open all returned releases', checked: openAll }} on:change={event => commitFilters({ openAll: event.detail.item.checked }, true)} />
          {/if}
        </div>

        {#if !releaseResults.length}
          <p>No releases match your search and filters.</p>
        {:else}
          <DocumentList cls="catalogue-results">
            {#each releaseResults.slice(0, showNumber) as result (result.release)}
              {@const release = result.release}
              {@const charts = result.charts}
              {@const totalCharts = (release.vis || []).length}
              {@const preview = charts[0] && screenshotUrl(charts[0].chart.url)}
              {@const topic = topics.find(topic => topic.id === release.theme)}
              <li class="catalogue-release">
                <div class="catalogue-release-summary">
                  <div class="catalogue-release-content">
                    <h3 class="catalogue-release-title ons-u-fs-m">
                      <a href={release.doc_uri} target="_blank" rel="noopener noreferrer">{release.title}</a>
                    </h3>
                    {#if topic}<p class="catalogue-release-topic">{topic.label}</p>{/if}
                    <p class="catalogue-release-edition">{release.edition?.trim() ? `Edition: ${release.edition}` : 'Edition not available'}</p>
                    <p class="catalogue-release-meta">
                      Release date: {d3.timeFormat('%d/%m/%Y')(new Date(release.release_date))}
                      <span class="catalogue-chart-count">{#if filters.chartTypes.length}{charts.length} matching {charts.length === 1 ? 'chart' : 'charts'} of {totalCharts}{:else}{totalCharts} {totalCharts === 1 ? 'chart' : 'charts'}{/if}</span>
                    </p>
                    {#if release.series?.trim()}
                      <p class="catalogue-series-link">
                        <a href={catalogueFiltersUrl($page.url, { search: release.series, showOnlyLatest: false }, knownTopicIds)} aria-label={`View all editions of ${release.series} (${editionCounts.get(release.series)})`}>View all editions ({editionCounts.get(release.series)})</a>
                      </p>
                    {/if}
                    {#if charts.length < totalCharts}
                      <p class="catalogue-series-link">
                        <a href={catalogueFiltersUrl($page.url, { releaseUri: release.doc_uri, showOnlyLatest: false, openAll: true }, knownTopicIds)}>See all charts in release</a>
                      </p>
                    {/if}
                  </div>
                  {#if preview}
                    <a class="catalogue-preview" href={release.doc_uri} target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">
                      <img src={preview} alt="" loading="lazy" onerror={event => event.currentTarget.hidden = true} />
                    </a>
                  {/if}
                </div>

                {#if charts.length}
                  <Details
                    title={`View ${charts.length}${filters.chartTypes.length ? ' matching' : ''} ${charts.length === 1 ? 'chart' : 'charts'}`}
                    headingTag="h3"
                    cls="catalogue-release-details"
                    open={openAll || expandedRelease === release}
                    on:toggle={event => toggleRelease(release, event)}
                  >
                    {#if openAll || expandedRelease === release}
                      {#each charts as { chart, index: chartIndex }}
                        {@const image = screenshotUrl(chart.url)}
                        <div class="catalogue-chart">
                          <h4 class="ons-u-fs-r--b">Chart {chartIndex + 1}{chart.chart_type ? `: ${chart.chart_type}` : ''}</h4>
                          <a href="https://www.ons.gov.uk/{chart.url}" target="_blank" rel="noopener noreferrer">
                            {#if image}
                              <img class="catalogue-chart-image" src={image} alt={`Chart ${chartIndex + 1} from ${release.title}`} loading="lazy" onerror={event => event.currentTarget.hidden = true} />
                            {/if}
                            <span class="catalogue-chart-link">View chart {chartIndex + 1} on the ONS website</span>
                          </a>
                        </div>
                      {/each}
                    {/if}
                  </Details>
                {/if}
              </li>
            {/each}
          </DocumentList>

          {#if showNumber < releaseResults.length}
            <div class="catalogue-load-more">
              <Button variant="secondary" on:click={() => showNumber += 18}>Load more</Button>
            </div>
          {/if}
        {/if}
      </section>
    {/if}
  </main>
</Embed>
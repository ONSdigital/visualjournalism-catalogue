<script>
  import { Embed, Header, Input, Button, Checkbox, Checkboxes, DocumentList, Details, Icon } from '@onsvisual/svelte-components';
  import { onMount, untrack } from 'svelte';
  import { browser } from '$app/environment';
  import { beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import * as d3 from 'd3';
  import { validateDateRange, matchesDateRange } from '$lib/date-filter.js';
  import { catalogueFiltersUrl, chartTypeId, matchingCharts, matchesReleaseView, readCatalogueFilters } from '$lib/release-filter.js';
  import LazyContent from '$lib/LazyContent.svelte';
  import ChartEmbed from '$lib/ChartEmbed.svelte';
  import TaxonomyCheckbox from '$lib/TaxonomyCheckbox.svelte';
  import { buildTaxonomy, matchesTaxonomy, taxonomyLabel, taxonomyState, toggleTaxonomy } from '$lib/taxonomy-filter.js';

  const knownThemeIds = ['businessindustryandtrade', 'economy', 'employmentandlabourmarket', 'peoplepopulationandcommunity'];
  const releaseBatchSize = 10;

  let data = $state([]);
  let taxonomy = $derived(buildTaxonomy(data));
  let editionCounts = $derived.by(() => {
    const counts = new Map();
    for (const release of data) {
      counts.set(release.series, (counts.get(release.series) || 0) + 1);
    }
    return counts;
  });
  let mounted = $state(false);
  let loadError = $state(false);
  let searchInputText = $state('');
  let searchField = $state(null);
  let chartTypeSearch = $state('');
  let openAll = $state(true);
  let disclosureOverrides = $state(new Map());
  let showNumber = $state(releaseBatchSize);
  let datefrom = $state('');
  let dateto = $state('');
  let dateTouched = $state({ from: false, to: false });
  let dateRange = $derived(validateDateRange(datefrom, dateto));
  let filters = $derived(readCatalogueFilters(browser ? $page.url.searchParams : new URLSearchParams(), knownThemeIds));
  let filterSignature = $derived(JSON.stringify(filters));
  let showOnlyLatest = $derived(filters.showOnlyLatest);
  let topicGroups = $derived(taxonomy.filter(node => taxonomyState(node, filters.taxonomy).selected > 0));
  let topicNodes = $derived(topicGroups.flatMap(node => node.children));
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
    showNumber = releaseBatchSize;
    disclosureOverrides = new Map();
    if (restored.releaseUri) openAll = true;
    untrack(() => {
      const heading = document.getElementById('results-heading');
      if (heading && heading.getBoundingClientRect().top < 0) {
        heading.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    });
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

    matchedReleases = matchedReleases.filter(release => matchesTaxonomy(release, filters.taxonomy));

    return matchedReleases.filter(release =>
      matchesReleaseView(release, filters) && matchesDateRange(release.release_date, filters)
    ).map(release => ({ release, charts: matchingCharts(release, filters.chartTypes) }))
      .filter(result => !filters.chartTypes.length || result.charts.length);
  });
  let matchingChartCount = $derived(releaseResults.reduce((count, result) => count + result.charts.length, 0));
  let disclosureState = $derived.by(() => {
    const expandable = releaseResults.filter(result => result.charts.length);
    const opened = expandable.filter(result => isReleaseOpen(result.release)).length;
    return {
      checked: expandable.length > 0 && opened === expandable.length,
      mixed: opened > 0 && opened < expandable.length,
      available: expandable.length > 0
    };
  });

  function commitFilters(patch) {
    const current = desiredFilters || filters;
    const href = catalogueFiltersUrl($page.url, {
      ...current,
      releaseUri: '',
      ...patch
    }, knownThemeIds);
    const next = readCatalogueFilters(new URL(href, $page.url).searchParams, knownThemeIds);
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

  function clearSearch() {
    searchInputText = '';
    searchField?.querySelector('input')?.focus();
    return commitFilters({ search: '' });
  }

  function clearAllFilters() {
    navigationVersion += 1;
    desiredFilters = null;
    navigationQueue = Promise.resolve();
    searchInputText = '';
    chartTypeSearch = '';
    datefrom = '';
    dateto = '';
    dateTouched = { from: false, to: false };
    showNumber = releaseBatchSize;
  }

  function setTaxonomy(path, checked) {
    return commitFilters({ taxonomy: toggleTaxonomy(taxonomy, (desiredFilters || filters).taxonomy, path, checked) });
  }

  function taxonomySummary(nodes) {
    const states = nodes.map(node => taxonomyState(node, filters.taxonomy));
    const checked = states.filter(state => state.checked).length;
    const partial = states.filter(state => state.mixed).length;
    return `(${checked} of ${nodes.length} selected${partial ? `, ${partial} partial` : ''})`;
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

  function loadNextBatch(element) {
    const signature = filterSignature;
    const shown = showNumber;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      if (signature !== filterSignature || shown !== showNumber) return;
      showNumber = Math.min(shown + releaseBatchSize, releaseResults.length);
    }, { rootMargin: '0px 0px 400px 0px' });
    observer.observe(element);
    return { destroy() { observer.disconnect(); } };
  }

  function isReleaseOpen(release) {
    return disclosureOverrides.get(release.doc_uri) ?? openAll;
  }

  function setOpenAll(checked) {
    openAll = checked;
    disclosureOverrides = new Map();
  }

  function syncDisclosureState(element, state) {
    const input = element.querySelector('input');
    input.indeterminate = state.mixed;
    return { update(next) { input.indeterminate = next.mixed; } };
  }

  function toggleRelease(release, event) {
    const isOpen = event.detail.e.target.open;
    if (isOpen === isReleaseOpen(release)) return;
    const next = new Map(disclosureOverrides);
    if (isOpen === openAll) next.delete(release.doc_uri);
    else next.set(release.doc_uri, isOpen);
    disclosureOverrides = next;
  }
</script>

<svelte:head>
  <title>ONS Data Visualisation Catalogue</title>
</svelte:head>

<div class="catalogue-header">
  <Header compact bilingual={false} skipHref="#main" />
  <section class="catalogue-heading-band" aria-labelledby="catalogue-title">
    <div class="catalogue-heading-inner">
      <h1 id="catalogue-title" class="ons-u-fs-3xl">
        <a class="catalogue-home" href={$page.url.pathname}>ONS Data Visualisation Catalogue</a>
      </h1>
      <p>Charts and interactive visualisations from Office for National Statistics releases.</p>
    </div>
  </section>
</div>

<Embed>
  <main id="main" class="catalogue" aria-labelledby="catalogue-title" tabindex="-1">
    {#if !mounted}
      <p role="status">Loading releases...</p>
    {:else if loadError}
      <p role="alert">Releases could not be loaded. Please refresh the page to try again.</p>
    {:else}
      <div class="catalogue-layout">
      <aside class="catalogue-sidebar" aria-label="Search and filter releases">
      <form class="catalogue-search" role="search" onsubmit={event => { event.preventDefault(); commitFilters({ search: searchInputText }); }}>
        <div class="catalogue-search-field" bind:this={searchField}>
          <Input id="release-search" label="Search release titles" bind:value={searchInputText} />
          {#if searchInputText || filters.search}
            <button type="button" class="catalogue-search-clear" title="Clear search" aria-label="Clear search" onclick={clearSearch}>
              <Icon type="cross" />
            </button>
          {/if}
        </div>
        <Button type="submit" icon="search">Search</Button>
      </form>

      <div class="catalogue-filters">
        <h2 class="ons-u-fs-m">Filter releases</h2>
              <Details title={`Chart types${filters.chartTypes.length ? ` (${filters.chartTypes.length} selected)` : ''}`} headingTag="h3" cls="catalogue-filter">
                <Input id="chart-type-search" label="Find a chart type" bind:value={chartTypeSearch} />
                <div class="catalogue-chart-type-options">
                  <Checkboxes items={visibleChartTypeItems} title="Chart types" hideTitle on:change={event => setChartType(event.detail.item)} />
                </div>
                {#if !visibleChartTypeItems.length}<p>No chart types match.</p>{/if}
              </Details>
        <Details title={`Themes ${taxonomySummary(taxonomy)}`} headingTag="h3" cls="catalogue-filter">
          {#each taxonomy as node (node.path)}
            <TaxonomyCheckbox {node} selection={filters.taxonomy} onchange={setTaxonomy} />
          {/each}
        </Details>
        <Details title={`Topics ${taxonomySummary(topicNodes)}`} headingTag="h3" cls="catalogue-filter">
          <div class="catalogue-taxonomy-options">
            {#each topicGroups as group (group.path)}
              <fieldset class="ons-fieldset catalogue-taxonomy-group">
                <legend class="catalogue-taxonomy-legend">{group.label}</legend>
                {#each group.children as node (node.path)}
                  <TaxonomyCheckbox {node} selection={filters.taxonomy} onchange={setTaxonomy} />
                {/each}
              </fieldset>
            {:else}
              <p>No topics available for the selected themes.</p>
            {/each}
          </div>
        </Details>
        <Details title="Date range" headingTag="h3" cls="catalogue-filter">
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
        </Details>
        <Details title="Editions" headingTag="h3" cls="catalogue-filter">
          <Checkbox
            id="latest-only"
            label="Show only latest edition"
            item={{ id: 'latest-only', label: 'Show only latest edition', checked: showOnlyLatest }}
            on:change={event => commitFilters({ showOnlyLatest: event.detail.item.checked })}
          />
        </Details>
        <Button variant="secondary" href={$page.url.pathname} cls="catalogue-clear-filters" on:click={clearAllFilters}>Clear all filters</Button>
      </div>
      </aside>

      <section class="catalogue-results-column" aria-labelledby="results-heading">
        <div class="catalogue-results-toolbar">
          <div>
            <h2 id="results-heading" class="ons-u-fs-l" aria-live="polite" aria-atomic="true">
              {releaseResults.length} {releaseResults.length === 1 ? 'release' : 'releases'}
              {#if filters.chartTypes.length}
                <span class="catalogue-matching-count">containing {matchingChartCount} matching {matchingChartCount === 1 ? 'chart' : 'charts'}</span>
              {/if}
            </h2>
            <!-- {#if releaseResults.length}
              <p class="catalogue-result-count" role="status" aria-atomic="true">Showing {Math.min(showNumber, releaseResults.length)} of {releaseResults.length}</p>
            {/if} -->
          </div>
          {#if disclosureState.available}
            <div class="catalogue-disclosure-control" use:syncDisclosureState={disclosureState}>
              <Checkbox id="open-all" label="Open all returned releases" item={{ id: 'open-all', label: 'Open all returned releases', checked: disclosureState.checked }} on:change={event => setOpenAll(event.detail.item.checked)} />
            </div>
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
              {@const topic = taxonomyLabel(release.topic)}
              <li class="catalogue-release">
                <LazyContent>
                <div class="catalogue-release-summary">
                  <div class="catalogue-release-content">
                    <h3 class="catalogue-release-title ons-u-fs-m">
                      <a href={release.doc_uri} target="_blank" rel="noopener noreferrer">{release.title}</a>
                    </h3>
                    <p class="catalogue-release-topic">{topic}</p>
                    <p class="catalogue-release-meta">
                      Release date: {d3.timeFormat('%d/%m/%Y')(new Date(release.release_date))}
                    </p>
                    {#if release.series?.trim()}
                      <p class="catalogue-series-link">
                        <a href={catalogueFiltersUrl($page.url, { search: release.series, showOnlyLatest: false }, knownThemeIds)} aria-label={`View all editions of ${release.series} (${editionCounts.get(release.series)})`}>View all editions ({editionCounts.get(release.series)})</a>
                      </p>
                    {/if}
                    {#if charts.length < totalCharts}
                      <p class="catalogue-series-link">
                        <a href={catalogueFiltersUrl($page.url, { releaseUri: release.doc_uri, showOnlyLatest: false }, knownThemeIds)}>See all charts in release</a>
                      </p>
                    {/if}
                  </div>
                </div>

                {#if charts.length}
                  <Details
                    title={`View ${charts.length}${filters.chartTypes.length ? ' matching' : ''} ${charts.length === 1 ? 'chart' : 'charts'}`}
                    headingTag="h3"
                    cls="catalogue-release-details"
                    open={isReleaseOpen(release)}
                    on:toggle={event => toggleRelease(release, event)}
                  >
                    {#if isReleaseOpen(release)}
                      {#each charts as { chart, index: chartIndex } (chartIndex)}
                        <div class="catalogue-chart">
                          <LazyContent initialHeight={400} label={`Loading chart ${chartIndex + 1}...`}>
                          <h4 class="ons-u-fs-r--b">Chart {chartIndex + 1}{chart.chart_type ? `: ${chart.chart_type}` : ''}</h4>
                          <ChartEmbed url={chart.url} title={`Chart ${chartIndex + 1} from ${release.title}`} />
                          </LazyContent>
                        </div>
                      {/each}
                    {/if}
                  </Details>
                {/if}
                </LazyContent>
              </li>
            {/each}
          </DocumentList>

          {#key `${filterSignature}:${showNumber}`}
            {#if showNumber < releaseResults.length}
              <div class="catalogue-load-sentinel" use:loadNextBatch aria-hidden="true"></div>
            {/if}
          {/key}
        {/if}
      </section>
      </div>
    {/if}
  </main>
</Embed>
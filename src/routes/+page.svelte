<script>
  import { Embed, Input, Button, Checkbox, Accordion, AccordionItem, Checkboxes, DocumentList, Details } from '@onsvisual/svelte-components';
  import { onMount, untrack } from 'svelte';
  import { browser } from '$app/environment';
  import { beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import * as d3 from 'd3';
  import { validateDateRange, matchesDateRange } from '$lib/date-filter.js';
  import { catalogueFiltersUrl, matchesReleaseView, readCatalogueFilters } from '$lib/release-filter.js';

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
  let openAll = $state(false);
  let expandedRelease = $state(null);
  let showNumber = $state(18);
  let datefrom = $state('');
  let dateto = $state('');
  let dateTouched = $state({ from: false, to: false });
  let dateRange = $derived(validateDateRange(datefrom, dateto));
  let filters = $derived(readCatalogueFilters(browser ? $page.url.searchParams : new URLSearchParams(), knownTopicIds));
  let filterSignature = $derived(JSON.stringify(filters));
  let showOnlyLatest = $derived(filters.showOnlyLatest);
  let topicItems = $derived(topics.map(topic => ({ ...topic, checked: filters.topicIds.includes(topic.id) })));
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
    openAll = false;
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

  let returnedReleases = $derived.by(() => {
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
    );
  });

  function commitFilters(patch) {
    const current = desiredFilters || filters;
    const href = catalogueFiltersUrl($page.url, { ...current, ...patch }, knownTopicIds);
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

  function screenshotUrl(url) {
    const filename = screenshots[url];
    return filename ? `${screenshotBase}${filename}.png` : null;
  }

  function toggleRelease(release, event) {
    const isOpen = event.detail.e.target.open;
    if (openAll) {
      if (!isOpen) {
        openAll = false;
        expandedRelease = null;
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
              {returnedReleases.length} {returnedReleases.length === 1 ? 'release' : 'releases'}
            </h2>
            {#if returnedReleases.length}
              <p class="catalogue-result-count">Showing {Math.min(showNumber, returnedReleases.length)} of {returnedReleases.length}</p>
            {/if}
          </div>
          {#if returnedReleases.length}
            <Checkbox id="open-all" label="Open all returned releases" bind:checked={openAll} on:change={() => expandedRelease = null} />
          {/if}
        </div>

        {#if !returnedReleases.length}
          <p>No releases match your search and filters.</p>
        {:else}
          <DocumentList cls="catalogue-results">
            {#each returnedReleases.slice(0, showNumber) as release (release)}
              {@const charts = release.vis || []}
              {@const preview = charts[0] && screenshotUrl(charts[0].url)}
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
                      <span class="catalogue-chart-count">{charts.length} {charts.length === 1 ? 'chart' : 'charts'}</span>
                    </p>
                    {#if release.series?.trim()}
                      <p class="catalogue-series-link">
                        <a href={catalogueFiltersUrl($page.url, { search: release.series, showOnlyLatest: false }, knownTopicIds)} aria-label={`View all editions of ${release.series} (${editionCounts.get(release.series)})`}>View all editions ({editionCounts.get(release.series)})</a>
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
                    title={`View ${charts.length} ${charts.length === 1 ? 'chart' : 'charts'}`}
                    headingTag="h3"
                    cls="catalogue-release-details"
                    open={openAll || expandedRelease === release}
                    on:toggle={event => toggleRelease(release, event)}
                  >
                    {#if openAll || expandedRelease === release}
                      {#each charts as chart, chartIndex}
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

          {#if showNumber < returnedReleases.length}
            <div class="catalogue-load-more">
              <Button variant="secondary" on:click={() => showNumber += 18}>Load more</Button>
            </div>
          {/if}
        {/if}
      </section>
    {/if}
  </main>
</Embed>
<script>
  import { Embed, Input, Button, Checkbox, Accordion, AccordionItem, Checkboxes, DocumentList, Details } from '@onsvisual/svelte-components';
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { validateDateRange, matchesDateRange } from '$lib/date-filter.js';

  const topics = [
    { id: 'economy', label: 'Economy', checked: false },
    { id: 'employmentandlabourmarket', label: 'Employment and labour market', checked: false },
    { id: 'peoplepopulationandcommunity', label: 'People, population and community', checked: false }
  ];
  const screenshotBase = 'https://raw.githubusercontent.com/ONSdigital/get-ons-vis-screenshots/main/screenshots/';

  let data = $state([]);
  let screenshots = $state({});
  let mounted = $state(false);
  let loadError = $state(false);
  let searchInputText = $state('');
  let searchString = $state('');
  let selectedTopics = $state([]);
  let openAll = $state(false);
  let expandedRelease = $state(null);
  let showNumber = $state(18);
  let datefrom = $state('');
  let dateto = $state('');
  let dateTouched = $state({ from: false, to: false });
  let appliedDateRange = $state({ from: '', to: '' });
  let dateRange = $derived(validateDateRange(datefrom, dateto));

  $effect(() => {
    if (dateRange.valid) {
      appliedDateRange = { from: dateRange.from, to: dateRange.to };
    }
  });

  onMount(async () => {
    try {
      const res = await fetch('https://raw.githubusercontent.com/ONSdigital/onsvisualjournalism-backend/main/data.json');
      if (!res.ok) throw new Error('Unable to load releases');
      data = await res.json();

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

    if (searchString) {
      const tokens = [];
      const regex = /"([^"]+)"|(\S+)/g;
      let match;
      while ((match = regex.exec(searchString)) !== null) {
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

    if (selectedTopics.length) {
      const topicIds = selectedTopics.map(topic => topic.id);
      matchedReleases = matchedReleases.filter(release => topicIds.includes(release.theme));
    }

    return matchedReleases.filter(release => matchesDateRange(release.release_date, appliedDateRange));
  });

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
      <form class="catalogue-search" role="search" onsubmit={event => { event.preventDefault(); searchString = searchInputText; }}>
        <Input id="release-search" label="Search release titles" bind:value={searchInputText} />
        <Button type="submit" icon="search">Search</Button>
      </form>

      <div class="catalogue-filters">
        <Accordion>
          <AccordionItem title="Filter releases">
            <div class="catalogue-topics">
              <Checkboxes items={topics} bind:value={selectedTopics} title="Topics" />
            </div>
            <div class="catalogue-dates">
              <div onfocusout={() => dateTouched.from = true}>
                <Input
                  id="datefrom"
                  label="Date from"
                  description={dateTouched.from && dateRange.errors.from ? dateRange.errors.from : 'E.g. 21/03/2022'}
                  error={dateTouched.from && Boolean(dateRange.errors.from)}
                  bind:value={datefrom}
                />
              </div>
              <div onfocusout={() => dateTouched.to = true}>
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
                    <p class="catalogue-release-meta">
                      Release date: {d3.timeFormat('%d/%m/%Y')(new Date(release.release_date))}
                      <span class="catalogue-chart-count">{charts.length} {charts.length === 1 ? 'chart' : 'charts'}</span>
                    </p>
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
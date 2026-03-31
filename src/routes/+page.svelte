<script>
  import { Embed, Select, Input, Button, Checkbox, Accordion, AccordionItem } from "@onsvisual/svelte-components";
  import { onMount } from 'svelte';
  import * as d3 from 'd3';


  let data = $state();
  let screenshots = $state();
  let mounted = $state();
  let searchInputText = $state();
  let searchString = $state();
  let openAll = $state(false)

  onMount(async () => {
    const res = await fetch(
      'https://raw.githubusercontent.com/ONSdigital/onsvisualjournalism-backend/main/data.json'
    );
    data = await res.json();

    const res2 = await fetch(
      'https://raw.githubusercontent.com/ONSdigital/get-ons-vis-screenshots/main/screenshot-filenames.json'
    );
    screenshots = await res2.json()

    mounted = true
  });

  $inspect(data)

let returnedReleases = $derived.by(() => {
  if (!searchString) return null;

  // const tokens = searchString.trim().split(/\s+/);
  
  // // Check if user has specified AND/OR logic
  // const hasOr = tokens.includes("OR");
  // const hasAnd = tokens.includes("AND");
  
  // // Remove the operator tokens, leaving just the search terms
  // const searchTerms = tokens.filter(t => t !== "OR" && t !== "AND");

  // console.log(searchTerms)

  const tokens = [];
  const regex = /"([^"]+)"|(\S+)/g;
  let match;
  while ((match = regex.exec(searchString)) !== null) {
    tokens.push(match[1] || match[2]); // match[1] = quoted phrase, match[2] = single word
  }

  const hasOr = tokens.includes("OR");
  const searchTerms = tokens.filter(t => t !== "OR" && t !== "AND");

  return [...data
    .filter((d) => {
      const title = d.title.toLowerCase();
      if (hasOr) {
        // Match if any term is found
        return searchTerms.some(t => title.includes(t.toLowerCase()));
      } else {
        // Default to AND behaviour - match if all terms are found
        return searchTerms.every(t => title.includes(t.toLowerCase()));
      }
    })]
    .sort((a, b) => new Date(b.release_date) - new Date(a.release_date));
})

</script>

<Embed>
  {#if mounted}
    <div class="search-container">
      <Input 
        id="text" 
        label="Search release titles" 
        clearable 
        bind:value={searchInputText}/>
      <div
        style:padding="32px 12px 0 12px"
        style:background={undefined === "ghost" ? "var(--ons-color-ocean-blue)" : null}
      >
        <Button 
          text="Search" 
          icon="search" 
          hideLabel 
          on:click={() => {
            searchString = searchInputText
          }}>
          {"Search"}</Button>
      </div>
      {#if returnedReleases}
        <div
          style:padding="12px"
          style:margin="18px 0 0 0"
          style:background={undefined === "ghost" ? "var(--ons-color-ocean-blue)" : null}
          style:color={undefined === "ghost" ? "white" : null}
        >
          <Checkbox id="open-all" label="Open all releases" bind:checked={openAll}/>
        </div>
      {/if}
    </div>

    <div class="options">
      <Accordion>
        <AccordionItem title="Filter results">

        </AccordionItem>
      </Accordion>
    </div>

    <ul class="grid">
        {#each returnedReleases as release, i}
          {#if !openAll}
            <li class={release.expanded ? "is-selected release" : "release"} id={"release"+ i}>
                <a class="bold" href={release.doc_uri} target="_blank">{release.title}</a>
                <p><span class="bold">Release date:</span> {d3.timeFormat("%d/%m/%Y")(new Date(release.release_date))}</p>
                <img
                    class="screenshot thumbnail"
                    src="https://raw.githubusercontent.com/ONSdigital/get-ons-vis-screenshots/main/screenshots/{screenshots[release.vis[0].url]}.png"
                    alt="Chart screenshot"
                />                
                <div class="expand-button">
                <p>This release contains <span class="bold">{release.vis.length} {release.vis.length > 1 ? "charts" : "chart"}</span></p>
                  <Button 
                    text={release.expanded ? "Close" : "Expand"}
                    on:click={() => {
                      if(release.expanded){
                        release.expanded = false
                      } else{
                        returnedReleases.forEach((r) => {r.expanded = false})
                        release.expanded = true
                      }
                    }}>
                  {release.expanded ? "Close" : "Expand"}</Button>
                </div>
            </li>
          {/if}
          <li class={release.expanded || openAll ? `fullwidth expanded ${!openAll ? 'has-close' : ''}` : "is-hidden"}>            
            {#if !openAll}
              <div class="float-right">
                <Button 
                  text="Close"
                  icon="cross"
                  hideLabel 
                  on:click={() => {
                    release.expanded = false
                  }}>
                {"Close"}</Button>
              </div>
            {/if}
            <a class="bold title" href={release.doc_uri} target="_blank">{release.title}</a>
            {#each release.vis as vis,i}
              {#if i != 0}
                <hr/>
              {/if}
              <p class="bold">Chart {i+1}</p>
              {#if vis.chart_type}
                <p>{vis.chart_type}</p>
              {/if}
              <a href="https://www.ons.gov.uk/{vis.url}" target="_blank">
                <img
                    class="screenshot"
                    src="https://raw.githubusercontent.com/ONSdigital/get-ons-vis-screenshots/main/screenshots/{screenshots[vis.url]}.png"
                    alt="Chart screenshot"
                />
              </a>
            {/each}
          </li>
        {/each}
      </ul>
  {/if}
</Embed>
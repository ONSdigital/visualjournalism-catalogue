<script>
  import { onMount } from 'svelte';
  import { Button } from '@onsvisual/svelte-components';
  import pym from 'pym.js';

  let { url, title } = $props();
  const id = $props.id();
  let host = $state();
  let mobile = $state(false);
  let ready = $state(false);
  let delayed = $state(false);
  let attempt = $state(0);
  let source = $derived.by(() => {
    try {
      const resolved = new URL(url, 'https://www.ons.gov.uk/');
      return resolved.origin === 'https://www.ons.gov.uk' ? resolved.href : '';
    } catch {
      return '';
    }
  });
  let mounted = $state(false);

  onMount(() => {
    mounted = true;
  });

  $effect(() => {
    if (!mounted || !source || !host) return;
    attempt;
    ready = false;
    delayed = false;
    const parent = new pym.Parent(host.id, source, {
      title,
      xdomain: '^https://www\\.ons\\.gov\\.uk$'
    });
    parent.iframe.setAttribute('height', '400');
    parent.iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    const timeout = setTimeout(() => delayed = true, 15000);
    parent.onMessage('height', message => {
      const height = Number(message);
      if (!Number.isFinite(height) || height <= 0 || height > 100000) return;
      ready = true;
      delayed = false;
      clearTimeout(timeout);
    });
    let previousWidth = 0;
    const observer = new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if (width > 0 && width !== previousWidth) {
        previousWidth = width;
        parent.sendWidth();
      }
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
      parent.remove();
    };
  });
</script>

<div class="chart-embed">
  {#if source}
    <fieldset class="chart-preview-modes ons-fieldset">
      <legend class="ons-fieldset__legend ons-u-vh">Preview width for {title}</legend>
      <label class="preview-option" for={`${id}-desktop`}>
        <input id={`${id}-desktop`} name={`${id}-width`} type="radio" value={false} bind:group={mobile} />
        Desktop
      </label>
      <label class="preview-option" for={`${id}-mobile`}>
        <input id={`${id}-mobile`} name={`${id}-width`} type="radio" value={true} bind:group={mobile} />
        Mobile
      </label>
    </fieldset>
    <div class="chart-frame" class:mobile aria-busy={!ready}>
      {#if !ready}
        <p class="chart-loading" role="status">{delayed ? 'Automatic chart resizing has not responded yet.' : 'Loading chart...'}</p>
      {/if}
      <div id={`${id}-frame`} bind:this={host} class="chart-host"></div>
    </div>
    {#if delayed && !ready}
      <p class="chart-delayed">The embedded preview may not fit its content. Open the original chart below to view it in full.</p>
      <Button variant="secondary" on:click={() => attempt += 1}>Retry chart</Button>
    {/if}
    <a class="catalogue-chart-link" href={source} target="_blank" rel="noopener noreferrer">Open original chart on the ONS website</a>
  {:else}
    <p role="status">This chart does not have a supported embed URL.</p>
  {/if}
</div>

<style>
  .chart-embed {
    min-width: 0;
  }

  .chart-preview-modes {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin: 0 0 16px;
    padding: 0;
    border: 0;
  }

  .preview-option {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .preview-option input {
    width: 20px;
    height: 20px;
    accent-color: var(--ons-color-ocean-blue, #206095);
  }

  .preview-option input:focus-visible {
    outline: 3px solid var(--ons-color-focus, #fd0);
    outline-offset: 3px;
  }

  .chart-frame {
    width: 700px;
    max-width: 100%;
  }

  .chart-frame.mobile {
    width: 390px;
  }

  .chart-host {
    width: 100%;
    min-height: 1px;
  }

  .chart-host :global(iframe) {
    display: block;
    width: 100%;
    border: 0;
  }

  .chart-loading {
    margin: 0 0 12px;
    padding: 12px;
    background: var(--ons-color-grey-10, #f0f0f0);
  }

  .chart-delayed {
    max-width: 700px;
    margin: 12px 0;
  }

  @media (max-width: 700px) {
    .chart-preview-modes {
      display: none;
    }

    .chart-frame,
    .chart-frame.mobile {
      width: 100%;
    }
  }
</style>
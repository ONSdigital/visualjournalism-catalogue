<script>
  import { LazyLoad } from '@onsvisual/svelte-components';

  let { children, initialHeight = 260, rootMargin = 200, label = 'Loading release...' } = $props();
  let entered = $state(false);
</script>

<div class="lazy-content" aria-busy={!entered}>
  <LazyLoad bind:entered {initialHeight} {rootMargin}>
    {@render children()}
  </LazyLoad>
  {#if !entered}
    <div class="lazy-placeholder" aria-hidden="true">
      <p>{label}</p>
      <div class="placeholder-line"></div>
      <div class="placeholder-line short"></div>
    </div>
  {/if}
</div>

<style>
  .lazy-content {
    position: relative;
    min-width: 0;
  }

  .lazy-placeholder {
    position: absolute;
    inset: 0;
    padding: 24px 0;
    box-sizing: border-box;
    pointer-events: none;
  }

  .lazy-placeholder p {
    margin: 0 0 16px;
  }

  .placeholder-line {
    height: 16px;
    max-width: 560px;
    margin-bottom: 12px;
    background: var(--ons-color-grey-10, #f0f0f0);
  }

  .placeholder-line.short {
    width: 60%;
    max-width: 320px;
  }
</style>
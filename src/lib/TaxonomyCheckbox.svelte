<script>
  import { Checkbox } from '@onsvisual/svelte-components';
  import { taxonomyState } from './taxonomy-filter.js';

  let { node, selection, onchange } = $props();
  let state = $derived(taxonomyState(node, selection));
  let item = $derived({ id: `taxonomy-${encodeURIComponent(node.path)}`, label: node.label, checked: state.checked });

  function mixedState(element, mixed) {
    const input = element.querySelector('input');
    input.indeterminate = mixed;
    return { update(value) { input.indeterminate = value; } };
  }
</script>

<div class="catalogue-taxonomy-checkbox" use:mixedState={state.mixed}>
  <Checkbox {item} on:change={() => onchange(node.path, !state.checked)} />
</div>

<style>
  .catalogue-taxonomy-checkbox :global(.ons-checkbox__input:indeterminate::after) {
    opacity: 1;
    border: 0;
    background: var(--ons-color-input-border);
    height: 3px;
    width: 12px;
    top: 8px;
    left: 3px;
    transform: none;
  }
</style>
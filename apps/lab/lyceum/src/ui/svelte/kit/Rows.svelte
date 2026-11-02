<script lang="ts">
  import { oneOf, records } from '../../kit';
  import { text, weight } from '../../kit.shape';
  import { useRender, type Props } from '../context';
  import { flag, usePlace } from '../place';
  import Sigil from './Sigil.svelte';

  let props: Props = $props();

  const place = usePlace(() => props);
  const render = useRender();
  const columns = $derived(records(props['columns']));
  const rowRef = $derived(text(props['rowRef']));
  const clickKey = $derived(text(props['clickKey']) ?? text(props['rowKey']) ?? '');
  const cols = $derived(columns.map((column) => `${weight(column['w']) ?? 1}fr`).join(' '));
  const labelled = $derived(columns.some((column) => (text(column['label']) ?? '') !== ''));
  const kindOf = (column: Record<string, unknown>): 'text' | 'mono' | 'sigil' => oneOf(column['kind'], ['text', 'mono', 'sigil'] as const) ?? 'text';
  const isSelected = (key: unknown): boolean => props['selected'] !== undefined && props['selected'] !== null && key === props['selected'];
  const press = (key: unknown): (() => void) | undefined => {
    const ref = rowRef;
    return ref === undefined ? undefined : () => render.dispatch({ type: 'ui:click', ref, payload: key });
  };
</script>

<div {...place()} class="rows" data-head={flag(labelled)}>{#if labelled}<div style="--cols: {cols}">{#each columns as column}<span>{text(column['label']) ?? ''}</span>{/each}</div>{/if}{#each records(props['rows']) as record}{@const key = record[clickKey]}<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions --><div style="--cols: {cols}" data-selected={flag(isSelected(key))} data-press={flag(rowRef !== undefined)} onclick={press(key)}>{#each columns as column}{@const kind = kindOf(column)}{@const value = record[text(column['key']) ?? '']}{#if value === null || value === undefined || (kind !== 'sigil' && value === '')}<span data-kind="missing">{text(column['missing']) ?? ''}</span>{:else if kind === 'sigil'}<span><Sigil shape={value} /></span>{:else}<span data-kind={kind}>{text(value) ?? ''}</span>{/if}{/each}</div>{:else}<div class="empty">{text(props['empty']) ?? ''}</div>{/each}</div>

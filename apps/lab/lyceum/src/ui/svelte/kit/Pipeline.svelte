<script lang="ts">
  import { INKS, oneOf } from '../../kit';
  import { pipelineColumns, pipelineOf, type PipelineStep } from '../../kit.shape';
  import type { Props } from '../context';
  import { flag, usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  const shape = $derived(pipelineOf(props));
  const at = (column: string, row: number): string => `grid-column: ${column}; grid-row: ${row}`;
</script>

{#snippet step(item: PipelineStep, style: string | undefined)}<div {style} class="pipeline-step" data-ink={oneOf(item.ink, INKS)} data-off={flag(item.off)}><b>{item.label}</b><i>{item.note}</i><span>{item.value}</span></div>{/snippet}{#snippet link(name: string, said: string, off: boolean, style: string | undefined)}<div {style} class={name} data-off={flag(off)}><span>{said}</span></div>{/snippet}<div {...place({ gridTemplateColumns: pipelineColumns(shape.steps.length) })} class="pipeline">{#each shape.steps as item, index}{@const next = shape.links[index]}{@render step(item, at(String(index * 2 + 1), 1))}{#if next !== undefined}{@render link('pipeline-link', next.label, next.off, at(String(index * 2 + 2), 1))}{/if}{/each}{#if shape.detour !== undefined}{@const detour = shape.detour}{@render link('pipeline-enter', detour.enter, detour.off, at(String(detour.from * 2 + 1), 2))}{@render link('pipeline-leave', detour.leave, !detour.back, at(String(detour.to * 2 + 1), 2))}<div style={at(`${detour.from * 2 + 1} / ${detour.to * 2 + 2}`, 3)} class="pipeline-detour" data-off={flag(detour.off)}><span class="pipeline-said">{detour.label}</span><div class="pipeline-inner">{#each detour.steps as item, index}{#if index > 0}{@render link('pipeline-link', '', item.off, undefined)}{/if}{@render step(item, undefined)}{/each}</div></div>{/if}{#if shape.legend.length > 0}<div style={at(`${(shape.detour?.to ?? 0) * 2 + 3} / -1`, 3)} class="pipeline-legend">{#each shape.legend as item}<span data-ink={oneOf(item.ink, INKS)}>{item.label}</span>{/each}</div>{/if}</div>

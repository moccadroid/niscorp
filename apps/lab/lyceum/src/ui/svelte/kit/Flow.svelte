<script lang="ts">
  import { INKS, oneOf, records } from '../../kit';
  import { flowDelays, text } from '../../kit.shape';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  // From the wall clock, so a flow drawn again does not make the dots jump back.
  const delays = flowDelays(Date.now());
</script>

<div {...place()} class="flow"><div class="flow-end">{text(props['from']) ?? ''}</div><div class="flow-lanes">{#each records(props['lanes']) as lane}<div class="flow-lane" data-toward={oneOf(lane['toward'], ['to', 'from'] as const) ?? 'to'} data-ink={oneOf(lane['ink'], INKS)}><span class="label">{text(lane['label']) ?? ''}</span><div class="flow-track">{#each delays as delay}<span class="flow-dot" style="animation-delay: {delay}"></span>{/each}</div></div>{/each}</div><div class="flow-end">{text(props['to']) ?? ''}</div></div>

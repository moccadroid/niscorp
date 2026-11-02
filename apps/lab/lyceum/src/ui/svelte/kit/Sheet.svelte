<script lang="ts">
  import { SCALES, oneOf } from '../../kit';
  import { narrowOf, sheetStyle, templateOf } from '../../kit.shape';
  import { provideNarrow, type Props } from '../context';
  import { flag, usePlace } from '../place';

  let { children, ...props }: Props = $props();

  const place = usePlace(() => props);
  const size = $derived(oneOf(props['size'], ['fill', 'auto'] as const) ?? 'auto');
  const narrow = $derived(narrowOf(props['narrow'], size));
  provideNarrow(() => narrow?.names);
</script>

<div {...place(sheetStyle(templateOf(props['areas'], props['rows'], props['cols'], size), narrow, size))} class="sheet" data-size={size} data-scale={oneOf(props['scale'], SCALES)} data-narrow={flag(narrow !== undefined)}>{@render children?.()}</div>

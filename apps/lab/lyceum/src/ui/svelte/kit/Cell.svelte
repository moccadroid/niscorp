<script lang="ts">
  import { ALIGNS, INKS, MARKS, oneOf } from '../../kit';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let { children, ...props }: Props = $props();

  const place = usePlace(() => props);
</script>

<div {...place()} class="cell" data-ink={oneOf(props['ink'], INKS)} data-mark={oneOf(props['mark'], MARKS)} data-align={oneOf(props['align'], ALIGNS)} data-pad={oneOf(props['pad'], ['none'] as const)} data-scroll={oneOf(props['scroll'], ['y', 'end'] as const)} data-xray={props['xray'] === true ? '' : undefined}>{@render children?.()}</div>

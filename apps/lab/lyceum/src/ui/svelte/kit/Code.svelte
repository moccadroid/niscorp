<script lang="ts">
  import { numbers, text } from '../../kit.shape';
  import type { Props } from '../context';
  import { flag, usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  const marked = $derived(new Set(numbers(props['marked'])));
</script>

<div {...place()} class="code">{#each (text(props['text']) ?? '').split('\n') as line, index}<span data-marked={flag(marked.has(index + 1))}>{line === '' ? ' ' : line}</span>{/each}</div>

<script lang="ts">
  import { text } from '../../kit.shape';
  import { foldOpen, rememberFold } from '../../fold';
  import type { Props } from '../context';

  let { children, ...props }: Props = $props();

  const name = $derived(text(props['name']) ?? '');
  const toggled = (event: Event): void => rememberFold(name, (event.currentTarget as HTMLDetailsElement).open);
</script>

<details class="fold" open={foldOpen(name)} ontoggle={toggled}><summary class="fold-label">{text(props['label']) ?? ''}</summary><div class="fold-body">{@render children?.()}</div></details>

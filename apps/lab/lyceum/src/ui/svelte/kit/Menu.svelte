<script lang="ts">
  import { text } from '../../kit.shape';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let { children, ...props }: Props = $props();

  const place = usePlace(() => props);
  let menu: HTMLDetailsElement | undefined = $state();
  let items: HTMLDivElement | undefined = $state();
  // Caught on the way down, because an entry's own press does not let the click travel up.
  const close = (event: Event): void => {
    if (event.target instanceof Node && items?.contains(event.target) === true) menu?.removeAttribute('open');
  };
</script>

<details {...place()} class="menu" bind:this={menu} onclickcapture={close}><summary class="menu-icon" aria-label={text(props['label']) ?? 'Menu'}></summary><div class="menu-items" bind:this={items}>{@render children?.()}</div></details>

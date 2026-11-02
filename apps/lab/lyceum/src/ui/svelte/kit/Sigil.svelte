<script lang="ts">
  import { SIGILS, oneOf } from '../../kit';
  import { SIGIL_SHAPES } from '../../kit.shape';
  import type { Props } from '../context';
  import { flag, usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  const known = $derived(oneOf(props['shape'], SIGILS));
</script>

<span {...place()}><svg viewBox="0 0 100 100" class="sigil" aria-hidden="true" data-size={flag(props['size'] === 'large')}>{#each known === undefined ? [] : SIGIL_SHAPES[known] as part}<svelte:element this={part.tag} {...part.attrs} />{/each}</svg></span>

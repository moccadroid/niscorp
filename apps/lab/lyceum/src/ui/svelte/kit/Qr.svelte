<script lang="ts">
  import { qrOf, text } from '../../kit.shape';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  const value = $derived(text(props['value']) ?? '');
  const qr = $derived(value === '' ? undefined : qrOf(value));
</script>

<span {...place()} class="qr">{#if qr !== undefined}<svg viewBox={qr.viewBox} shape-rendering="crispEdges" role="img" aria-label={value}><rect width="100%" height="100%" class="qr-ground"></rect><path d={qr.d}></path></svg>{/if}</span>

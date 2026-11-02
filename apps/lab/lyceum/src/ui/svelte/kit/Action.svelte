<script lang="ts">
  import { INKS, oneOf } from '../../kit';
  import { text } from '../../kit.shape';
  import type { Props } from '../context';
  import { usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
</script>

<button {...place()} type="button" class="action" data-ink={oneOf(props['ink'], INKS)} data-lines={oneOf(props['lines'], ['two'] as const)} data-size={oneOf(props['size'], ['large'] as const)} data-sound={oneOf(props['sound'], ['chime'] as const)}><span>{text(props['label']) ?? ''}</span></button>

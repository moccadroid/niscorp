<script lang="ts">
  import { INKS, LANGS, PANES, oneOf } from '../../kit';
  import { codeLines, fitOf, numbers, text } from '../../kit.shape';
  import type { Props } from '../context';
  import { flag, usePlace } from '../place';

  let props: Props = $props();

  const place = usePlace(() => props);
  const lang = $derived(oneOf(props['lang'], LANGS));
  const source = $derived(text(props['text']) ?? '');
  const lines = $derived(codeLines(source, lang, numbers(props['marked'])));
</script>

<figure {...place(fitOf(props['fit'], source) ?? {})} class="exhibit" data-lang={lang} data-tone={oneOf(props['tone'], PANES)} data-flag={oneOf(props['flag'], INKS)} data-fit={flag(props['fit'] === true)}><figcaption>{text(props['label']) ?? ''}</figcaption><pre>{#each lines as line}<span data-marked={flag(line.marked)}>{@html line.html}</span>{/each}</pre></figure>

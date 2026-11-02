<script lang="ts">
  import { scopeDispatch } from '@niscorp/nova';
  import { text } from '../kit.shape';
  import { provideRender, useRender, type Props } from './context';

  let { children, ...props }: Props = $props();

  const outer = useRender();
  const instanceId = $derived(text(props['instanceId']));
  const action = $derived(text(props['definitionId']) ?? '');
  provideRender({
    registry: outer.registry,
    dispatch: (event) => (instanceId === undefined ? outer.dispatch : scopeDispatch(outer.dispatch, instanceId))(event),
    publish: outer.publish,
  });
</script>

<div data-action={action} data-instance={instanceId ?? ''}><span class="xray-tag">{action}</span>{@render children?.()}</div>

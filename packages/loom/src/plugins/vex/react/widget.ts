import type { NovaModelBinding } from '@niscorp/nova/react';

// Props a custom-widget render receives from the compiler: the field's current
// value (auto-derived from the bound model) and the model binding to write back
// through (via useModelWrite).
export type WidgetProps = { value?: unknown; novaModel?: NovaModelBinding };

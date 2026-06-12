import type { CSSProperties, FC } from 'react';
import type { NormalizedType } from '@niscorp/vex';
import type { NovaComponent, NovaModelBinding } from '@niscorp/nova/react';
import { useModelWrite } from '@react/hooks/model';
import type { Catalog } from '../widgets.js';
import { useScopedColumns } from './columns.js';
import { Combo } from './combobox.js';
import { fieldStyle } from './styles.js';
import type { WidgetProps } from './widget.js';

// A standalone field path: a sort key, `isNull`/`isNotNull`, or a `fields` /
// `groupBy` item. A combobox that autocompletes against the scoped columns.
const FieldPath: FC<{ value: unknown; catalog: Catalog; model: NovaModelBinding | undefined }> = ({ value, catalog, model }) => {
  const set = useModelWrite(model);
  const columns = useScopedColumns(catalog);
  return <Combo value={String(value ?? '')} placeholder="entity.field" options={columns} onPick={set} style={{ width: '100%' }} />;
};

// The right operand, typed by the left column: a number box for numeric columns,
// a true/false select for booleans, a text box otherwise.
const Operand: FC<{ type: NormalizedType | undefined; value: unknown; onChange: (value: unknown) => void }> = ({ type, value, onChange }) => {
  const style: CSSProperties = { ...fieldStyle, flex: 1, minWidth: 0 };
  if (type === 'number') {
    return (
      <input
        type="number"
        value={typeof value === 'number' ? value : ''}
        placeholder="value"
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        style={style}
      />
    );
  }
  if (type === 'boolean') {
    return (
      <select
        value={value === true ? 'true' : value === false ? 'false' : ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value === 'true')}
        style={style}
      >
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      value={value === null || value === undefined ? '' : String(value)}
      placeholder="value"
      onChange={(event) => onChange(event.target.value)}
      style={style}
    />
  );
};

// A comparison `[left, right]`: a field-path picker + an operand typed by the
// chosen column, instead of editing the tuple as raw JSON.
const Comparison: FC<{ value: unknown; catalog: Catalog; model: NovaModelBinding | undefined }> = ({ value, catalog, model }) => {
  const set = useModelWrite(model);
  const columns = useScopedColumns(catalog);
  const tuple = Array.isArray(value) ? value : [];
  const left = tuple[0];
  const right = tuple[1];
  const type = typeof left === 'string' ? catalog.typeOf(left) : undefined;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <Combo
        value={String(left ?? '')}
        placeholder="entity.field"
        options={columns}
        onPick={(next) => set([next, right ?? null])}
        style={{ flex: 2, minWidth: 0 }}
      />
      <Operand type={type} value={right} onChange={(next) => set([left ?? '', next])} />
    </div>
  );
};

// The role components — closures over the catalog, registered under the widget
// roles. Each receives `{ value, novaModel }` from the compiler.
export const fieldPathWidget = (catalog: Catalog): NovaComponent<WidgetProps> =>
  ({ value, novaModel }) => <FieldPath value={value} catalog={catalog} model={novaModel} />;

export const comparisonWidget = (catalog: Catalog): NovaComponent<WidgetProps> =>
  ({ value, novaModel }) => <Comparison value={value} catalog={catalog} model={novaModel} />;

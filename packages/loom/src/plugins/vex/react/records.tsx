import type { FC, ReactNode } from 'react';
import type { NovaComponent, NovaModelBinding } from '@niscorp/nova/adapters/react';
import { useModelWrite } from '@react/hooks/model';
import { JsonEditor } from '@react/kit';
import { isRecord } from '@compile/parse';
import type { Catalog } from '../widgets.js';
import { useScopedColumns } from './columns.js';
import { Combo } from './combobox.js';
import { fieldStyle, controlBtn } from './styles.js';
import type { WidgetProps } from './widget.js';

// The alias -> value rows shared by `compute` and `aggregate`: one row per entry
// (alias input + value editor + remove), plus add. Rows are keyed by index so
// renaming an alias doesn't remount the value editor. Writes the whole object on
// any change. `renderValue` is the per-entry value editor; `newEntry` is the
// value an added row starts from.
const RecordRows: FC<{
  value: unknown;
  model: NovaModelBinding | undefined;
  newEntry: unknown;
  renderValue: (value: unknown, onChange: (value: unknown) => void) => ReactNode;
}> = ({ value, model, newEntry, renderValue }) => {
  const set = useModelWrite(model);
  const entries = isRecord(value) ? Object.entries(value) : [];
  const write = (next: [string, unknown][]): void => set(Object.fromEntries(next));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, border: '1px dashed #d1d5db', borderRadius: 6 }}>
      {entries.map(([key, val], index) => (
        <div key={index} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <input
            value={key}
            placeholder="alias"
            onChange={(event) => write(entries.map((entry, i) => (i === index ? [event.target.value, entry[1]] : entry)))}
            style={{ ...fieldStyle, width: 110 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {renderValue(val, (next) => write(entries.map((entry, i) => (i === index ? [entry[0], next] : entry))))}
          </div>
          <button type="button" onClick={() => write(entries.filter((_, i) => i !== index))} style={controlBtn}>✕</button>
        </div>
      ))}
      <button type="button" onClick={() => write([...entries, [`field_${entries.length + 1}`, newEntry]])} style={{ ...controlBtn, alignSelf: 'flex-start' }}>Add</button>
    </div>
  );
};

// A field-or-literal operand: a column picker that also takes a typed literal
// (numbers and booleans are coerced; everything else stays a string — a column
// path or a string literal).
const coerceLiteral = (text: string): unknown => {
  if (text === '') return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  const n = Number(text);
  return text.trim() !== '' && Number.isFinite(n) ? n : text;
};

const ValueInput: FC<{ value: unknown; columns: string[]; onChange: (value: unknown) => void }> = ({ value, columns, onChange }) => (
  <Combo
    value={value === null || value === undefined ? '' : String(value)}
    placeholder="field or value"
    options={columns}
    onPick={(text) => onChange(coerceLiteral(text))}
    style={{ flex: 1, minWidth: 120 }}
  />
);

// aggregate value: count | sum | avg | min | max, applied to a column.
const AGG_OPS = ['count', 'sum', 'avg', 'min', 'max'];

const AggregateValue: FC<{ value: unknown; onChange: (value: unknown) => void; catalog: Catalog }> = ({ value, onChange, catalog }) => {
  const columns = useScopedColumns(catalog);
  const record = isRecord(value) ? value : {};
  const op = AGG_OPS.find((candidate) => candidate in record) ?? 'count';
  const operand = typeof record[op] === 'string' ? (record[op] as string) : '';
  const options = op === 'count' ? ['*', ...columns] : columns;
  const switchOp = (next: string): void => {
    let carried = operand;
    if (next === 'count' && carried === '') carried = '*';
    if (next !== 'count' && carried === '*') carried = '';
    onChange({ [next]: carried });
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select value={op} onChange={(event) => switchOp(event.target.value)} style={{ ...fieldStyle, width: 90 }}>
        {AGG_OPS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
      </select>
      <Combo value={operand} placeholder="entity.field" options={options} onPick={(next) => onChange({ [op]: next })} style={{ flex: 1, minWidth: 0 }} />
    </div>
  );
};

// compute value: arithmetic (two operands), concat/coalesce (operand list), or
// case (the recursive filter, edited as JSON via Loom's editor).
const ARITHMETIC = new Set(['add', 'subtract', 'multiply', 'divide']);
const LISTS = new Set(['concat', 'coalesce']);
const COMPUTE_OPS = ['add', 'subtract', 'multiply', 'divide', 'concat', 'coalesce', 'case'];

const ComputeValue: FC<{ value: unknown; onChange: (value: unknown) => void; catalog: Catalog }> = ({ value, onChange, catalog }) => {
  const columns = useScopedColumns(catalog);
  const record = isRecord(value) ? value : {};
  const op = COMPUTE_OPS.find((candidate) => candidate in record) ?? 'add';
  const operands = Array.isArray(record[op]) ? (record[op] as unknown[]) : [];

  const switchOp = (next: string): void => {
    if (next === 'case') {
      onChange({ case: { when: [{ condition: { eq: ['', ''] }, then: '' }], else: '' } });
    } else if (ARITHMETIC.has(next)) {
      onChange({ [next]: [operands[0] ?? '', operands[1] ?? ''] });
    } else {
      onChange({ [next]: operands.length >= 2 ? operands : ['', ''] });
    }
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <select value={op} onChange={(event) => switchOp(event.target.value)} style={{ ...fieldStyle, width: 90 }}>
        {COMPUTE_OPS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
      </select>
      {ARITHMETIC.has(op) ? (
        <>
          <ValueInput value={operands[0]} columns={columns} onChange={(next) => onChange({ [op]: [next, operands[1] ?? ''] })} />
          <ValueInput value={operands[1]} columns={columns} onChange={(next) => onChange({ [op]: [operands[0] ?? '', next] })} />
        </>
      ) : null}
      {LISTS.has(op) ? (
        <OperandList values={operands} columns={columns} onChange={(list) => onChange({ [op]: list })} />
      ) : null}
      {op === 'case' ? (
        <div style={{ flex: 1, minWidth: 200 }}>
          <JsonEditor value={record.case} onChange={(next) => onChange({ case: next })} />
        </div>
      ) : null}
    </div>
  );
};

// concat / coalesce: a list of operands (min 2), with add and remove.
const OperandList: FC<{ values: unknown[]; columns: string[]; onChange: (values: unknown[]) => void }> = ({ values, columns, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
    {values.map((operand, index) => (
      <div key={index} style={{ display: 'flex', gap: 4 }}>
        <ValueInput value={operand} columns={columns} onChange={(next) => onChange(values.map((current, i) => (i === index ? next : current)))} />
        <button type="button" disabled={values.length <= 2} onClick={() => onChange(values.filter((_, i) => i !== index))} style={controlBtn}>✕</button>
      </div>
    ))}
    <button type="button" onClick={() => onChange([...values, ''])} style={{ ...controlBtn, alignSelf: 'flex-start' }}>+</button>
  </div>
);

// The role components — closures over the catalog, registered under the widget
// roles. Each receives `{ value, novaModel }` from the compiler.
export const aggregateWidget = (catalog: Catalog): NovaComponent<WidgetProps> =>
  ({ value, novaModel }) => (
    <RecordRows value={value} model={novaModel} newEntry={{ count: '*' }} renderValue={(v, onChange) => <AggregateValue value={v} onChange={onChange} catalog={catalog} />} />
  );

export const computeWidget = (catalog: Catalog): NovaComponent<WidgetProps> =>
  ({ value, novaModel }) => (
    <RecordRows value={value} model={novaModel} newEntry={{ add: ['', ''] }} renderValue={(v, onChange) => <ComputeValue value={v} onChange={onChange} catalog={catalog} />} />
  );

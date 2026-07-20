import { useState, type CSSProperties, type FC, type ReactNode } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { NodeSchema } from '@niscorp/prism';
import { parse, buildDocument } from '@compile/parse';
import type { Field, Variant } from '@compile/types';
import { useModelWrite } from '@react/hooks/model.js';
import { JsonEditor } from '@react/kit/json-editor.js';
import { ActionMenu, MenuItem, SubMenu } from '@react/kit/menu.js';

// The Prism Node editor: a recursive React editor for one Prism node, supplied
// by the plugin under the `prism:node` role. It owns the recursion (a node's
// arguments are themselves nodes, directly, not through arrays — which Loom's
// array-driven recursion does not cover) and the domain UX (a grouped op
// chooser). It reads its value from the model and writes the *whole* node back
// through that one binding, so to Nova it is an ordinary control: the data
// store, validation, and the preview all keep working, and Prism's `$`-data
// never round-trips through Nova's binding resolver.

// ─── Node kinds, derived from the schema ─────────────────────
// One descriptor per thing a node can be: each op, the JSON primitives, an array
// of nodes, and the plain-object template. Built from the parsed IR so it tracks
// the schema; categories are the plugin's domain knowledge.

type NodeKind = { id: string; label: string; category: string; variant: Variant };

const CATEGORY_ORDER = ['Value', 'Core', 'Array', 'Math', 'String', 'Predicate', 'Logic', 'Structure', 'Object', 'Time', 'Sugar'];

const OP_CATEGORY: Record<string, string> = {
  $ref: 'Core', $const: 'Core', $var: 'Core', $get: 'Core', $with: 'Core',
  $map: 'Array', $filter: 'Array', $reduce: 'Array', $slice: 'Array', $flatten: 'Array', $unique: 'Array', $sortBy: 'Array',
  $add: 'Math', $sub: 'Math', $mul: 'Math', $div: 'Math', $round: 'Math',
  $join: 'String', $toString: 'String', $interpolate: 'String', $trim: 'String', $lower: 'String', $upper: 'String', $split: 'String', $replace: 'String',
  $eq: 'Predicate', $neq: 'Predicate', $gt: 'Predicate', $gte: 'Predicate', $lt: 'Predicate', $lte: 'Predicate', $empty: 'Predicate', $startsWith: 'Predicate', $endsWith: 'Predicate', $contains: 'Predicate',
  $not: 'Logic', $and: 'Logic', $or: 'Logic',
  $merge: 'Structure', $coalesce: 'Structure', $case: 'Structure', $entriesOf: 'Structure', $keyBy: 'Structure', $groupBy: 'Structure',
  $keys: 'Object', $values: 'Object', $fromEntries: 'Object', $pick: 'Object', $omit: 'Object', $type: 'Object', $length: 'Object',
  $date: 'Time', $dateAdd: 'Time', $dateDiff: 'Time',
  $sum: 'Sugar', $avg: 'Sugar', $count: 'Sugar', $min: 'Sugar', $max: 'Sugar', $pluck: 'Sugar', $take: 'Sugar', $drop: 'Sugar', $match: 'Sugar', $flatMap: 'Sugar',
};

const TYPE_LABEL: Record<string, string> = { string: 'string', number: 'number', boolean: 'boolean', null: 'null', array: 'array of nodes' };

const NODE_IR = parse(NodeSchema);
const KINDS: NodeKind[] = (NODE_IR.kind === 'union' ? NODE_IR.variants : []).map((variant) => {
  if (variant.pattern.kind === 'key') {
    const id = variant.pattern.key;
    return { id, label: id, category: OP_CATEGORY[id] ?? 'Other', variant };
  }
  if (variant.pattern.kind === 'type') {
    const id = variant.pattern.type;
    return { id, label: TYPE_LABEL[id] ?? id, category: 'Value', variant };
  }
  return { id: 'template', label: 'object (template)', category: 'Value', variant };
});
const BY_ID = new Map(KINDS.map((kind) => [kind.id, kind]));
const OP_KEYS = new Set(KINDS.filter((kind) => kind.category !== 'Value').map((kind) => kind.id));

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// The op's single argument field (the value behind its `$op` key); a primitive
// or array kind has its own field directly.
const argFieldOf = (variant: Variant): Field | undefined =>
  variant.field.kind === 'object' ? variant.field.fields[0]?.field : variant.field;

// Which kind a value currently is — the chooser's selection.
const kindOf = (value: unknown): string => {
  if (Array.isArray(value)) return 'array';
  if (value === null || value === undefined) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return type;
  if (type === 'object') return Object.keys(value as object).find((key) => OP_KEYS.has(key)) ?? 'template';
  return 'template';
};

// A fresh value when the chooser switches to a kind.
const defaultFor = (id: string): unknown => {
  switch (id) {
    case 'template': return {};
    case 'array': return [];
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'null': return null;
    default: {
      const arg = argFieldOf(BY_ID.get(id)!.variant);
      return { [id]: arg !== undefined ? buildDocument(arg, {}) : {} };
    }
  }
};

const defaultItem = (field: Field): unknown =>
  field.kind === 'self' ? null : field.kind === 'string' ? '' : field.kind === 'number' ? 0 : field.kind === 'boolean' ? false : buildDocument(field, {});

// ─── Wrap / unwrap ───────────────────────────────────────────
// Restructure without retyping: wrap the current node into an op's input slot,
// or unwrap an op down to one of its node arguments. Driven by the IR — a node
// slot is a `self` field.

// A field's primary node slot: a function that places a node into it (a `self`
// directly, the first element of an array/tuple of nodes, or — recursing one
// level — the first slotted field of an object). Undefined when the field has
// no place for a node, which is exactly what makes an op a valid wrap target.
const nodeSlot = (field: Field): ((node: unknown) => unknown) | undefined => {
  if (field.kind === 'self') return (node) => node;
  if (field.kind === 'array' && field.item.kind === 'self') return (node) => [node];
  if (field.kind === 'tuple') {
    const at = field.items.findIndex((item) => item.kind === 'self');
    if (at < 0) return undefined;
    return (node) => {
      const slots = (buildDocument(field, {}) as unknown[]).slice();
      slots[at] = node;
      return slots;
    };
  }
  if (field.kind === 'object') {
    const prop = field.fields.find((p) => nodeSlot(p.field) !== undefined);
    if (prop === undefined) return undefined;
    const place = nodeSlot(prop.field)!;
    return (node) => ({ ...(isObj(buildDocument(field, {})) ? (buildDocument(field, {}) as object) : {}), [prop.key]: place(node) });
  }
  return undefined;
};

// The kinds a node can be wrapped into: every op with a node slot, plus a list.
const WRAP_TARGETS = KINDS.filter((kind) => {
  if (kind.id === 'array') return true;
  if (kind.category === 'Value') return false;
  const arg = argFieldOf(kind.variant);
  return arg !== undefined && nodeSlot(arg) !== undefined;
});

const wrapInto = (id: string, node: unknown): unknown =>
  id === 'array' ? [node] : { [id]: nodeSlot(argFieldOf(BY_ID.get(id)!.variant)!)!(node) };

// The node-valued children of a field+value (one level down), each a place to
// unwrap to: a `self` field, the elements of an array/tuple of nodes.
const nodeChildren = (field: Field | undefined, value: unknown): { label: string; node: unknown }[] => {
  if (field === undefined) return [];
  if (field.kind === 'self') return [{ label: 'value', node: value }];
  if (field.kind === 'array' && field.item.kind === 'self') return (Array.isArray(value) ? value : []).map((node, i) => ({ label: `#${i + 1}`, node }));
  if (field.kind === 'tuple') return field.items.flatMap((item, i) => (item.kind === 'self' ? [{ label: `#${i + 1}`, node: Array.isArray(value) ? value[i] : undefined }] : []));
  if (field.kind === 'object') {
    return field.fields.flatMap((p) => {
      const inner = isObj(value) ? value[p.key] : undefined;
      const at = p.field.title ?? p.key;
      if (p.field.kind === 'self') return [{ label: at, node: inner }];
      if (p.field.kind === 'array' && p.field.item.kind === 'self') return (Array.isArray(inner) ? inner : []).map((node, i) => ({ label: `${at} #${i + 1}`, node }));
      if (p.field.kind === 'tuple') return p.field.items.flatMap((item, i) => (item.kind === 'self' ? [{ label: `${at} #${i + 1}`, node: Array.isArray(inner) ? inner[i] : undefined }] : []));
      return [];
    });
  }
  return [];
};

// The places the current node can be unwrapped to: its node-valued children.
const unwrapChildren = (value: unknown): { label: string; node: unknown }[] => {
  const id = kindOf(value);
  if (id === 'array') return (Array.isArray(value) ? value : []).map((node, i) => ({ label: `#${i + 1}`, node }));
  if (id === 'template') return Object.entries(isObj(value) ? value : {}).map(([key, node]) => ({ label: key, node }));
  const kind = BY_ID.get(id);
  if (kind === undefined || kind.category === 'Value') return [];
  return nodeChildren(argFieldOf(kind.variant), isObj(value) ? value[id] : undefined);
};

// ─── Styles ──────────────────────────────────────────────────

const input: CSSProperties = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' };
const block: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const nested: CSSProperties = { ...block, paddingLeft: 12, borderLeft: '2px solid #e5e7eb' };
const groupBox: CSSProperties = { ...block, padding: 10, border: '1px solid #e5e7eb', borderRadius: 6 };
const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151' };
const rowStyle: CSSProperties = { display: 'flex', gap: 6, alignItems: 'flex-start' };
const iconBtn: CSSProperties = { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 };
const addBtn: CSSProperties = { ...input, alignSelf: 'flex-start', cursor: 'pointer', background: '#f3f4f6', width: 'auto' };
const chooserBtn: CSSProperties = { ...input, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: '#fff', textAlign: 'left' };
const popover: CSSProperties = { position: 'absolute', top: '100%', left: 0, zIndex: 40, marginTop: 4, width: 380, background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden' };
const catPane: CSSProperties = { minWidth: 132, borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: 4 };
const opPane: CSSProperties = { flex: 1, overflowY: 'auto', padding: 4 };
const tag: CSSProperties = { fontSize: 11, color: '#9ca3af' };
const empty: CSSProperties = { padding: 12, fontSize: 13, color: '#9ca3af' };
const CHOOSER_CSS = '.prism-pick{width:100%;box-sizing:border-box;text-align:left;padding:6px 10px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;gap:10px;align-items:center;}.prism-pick:hover{background:#f3f4f6;}.prism-pick[data-active="true"]{background:#eff6ff;color:#1d4ed8;font-weight:600;}';

// ─── The grouped chooser ─────────────────────────────────────

const NodeKindChooser: FC<{ current: string; onPick: (id: string) => void }> = ({ current, onPick }) => {
  const here = BY_ID.get(current);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(here?.category ?? 'Value');
  const categories = CATEGORY_ORDER.filter((cat) => KINDS.some((kind) => kind.category === cat));
  const q = query.trim().toLowerCase();
  const found = q ? KINDS.filter((kind) => kind.id.toLowerCase().includes(q) || kind.label.toLowerCase().includes(q)) : [];
  const inCategory = KINDS.filter((kind) => kind.category === category);
  const pick = (id: string): void => { onPick(id); setOpen(false); setQuery(''); };

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" style={chooserBtn} onClick={() => setOpen((was) => !was)}>
        <span>{here?.label ?? current}</span>
        <span style={{ opacity: 0.5 }}>▾</span>
      </button>
      {open ? (
        <>
          <div onMouseDown={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
          <div style={popover}>
            <style>{CHOOSER_CSS}</style>
            <input
              autoFocus
              placeholder="Search ops…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ ...input, margin: 8, width: 'calc(100% - 16px)', borderRadius: 6 }}
            />
            {q ? (
              <div style={{ maxHeight: 300, overflowY: 'auto', paddingBottom: 4 }}>
                {found.length === 0 ? (
                  <div style={empty}>No match</div>
                ) : (
                  found.map((kind) => (
                    <button key={kind.id} type="button" className="prism-pick" data-active={kind.id === current} onClick={() => pick(kind.id)}>
                      <span>{kind.label}</span>
                      <span style={tag}>{kind.category}</span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', maxHeight: 300 }}>
                <div style={catPane}>
                  {categories.map((cat) => (
                    <button key={cat} type="button" className="prism-pick" data-active={cat === category} onMouseEnter={() => setCategory(cat)} onClick={() => setCategory(cat)}>
                      <span>{cat}</span>
                      <span style={{ opacity: 0.4 }}>▸</span>
                    </button>
                  ))}
                </div>
                <div style={opPane}>
                  {inCategory.map((kind) => (
                    <button key={kind.id} type="button" className="prism-pick" data-active={kind.id === current} onClick={() => pick(kind.id)}>
                      <span>{kind.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

// ─── Argument / list / template editors ──────────────────────

const Labeled: FC<{ label: string; required?: boolean; children: ReactNode }> = ({ label: text, required, children }) => (
  <label style={block}>
    <span style={label}>{text}{required ? ' *' : ''}</span>
    {children}
  </label>
);

// Edit a value against an IR field — a node's argument. A `self` recurses into a
// NodeEditor; an object composes labeled sub-editors; an array becomes a list;
// scalars are inputs; anything else falls back to raw JSON.
const ArgEditor: FC<{ field: Field; value: unknown; onChange: (next: unknown) => void }> = ({ field, value, onChange }) => {
  switch (field.kind) {
    case 'string':
      return <input style={input} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />;
    case 'number':
      return <input style={input} type="number" value={Number.isFinite(value) ? (value as number) : ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />;
    case 'boolean':
      return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} style={{ width: 16, height: 16 }} />;
    case 'enum':
      return (
        <select style={input} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          {field.options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
          ))}
        </select>
      );
    case 'self':
      return <NodeEditor value={value} onChange={onChange} />;
    case 'array':
      return <ListEditor itemField={field.item} value={value} onChange={onChange} />;
    case 'tuple':
      return (
        <div style={groupBox}>
          {field.items.map((item, index) => (
            <Labeled key={index} label={`#${index + 1}`}>
              <ArgEditor
                field={item}
                value={Array.isArray(value) ? value[index] : undefined}
                onChange={(next) => {
                  const slots = Array.isArray(value) ? [...value] : [];
                  slots[index] = next;
                  onChange(slots);
                }}
              />
            </Labeled>
          ))}
        </div>
      );
    case 'object':
      return (
        <div style={groupBox}>
          {field.fields.map((prop) => (
            <Labeled key={prop.key} label={prop.field.title ?? prop.key} required={prop.required}>
              <ArgEditor
                field={prop.field}
                value={isObj(value) ? value[prop.key] : undefined}
                onChange={(next) => onChange({ ...(isObj(value) ? value : {}), [prop.key]: next })}
              />
            </Labeled>
          ))}
        </div>
      );
    default:
      return <JsonEditor value={value} onChange={onChange} />;
  }
};

const ListEditor: FC<{ itemField: Field; value: unknown; onChange: (next: unknown) => void }> = ({ itemField, value, onChange }) => {
  const list = Array.isArray(value) ? value : [];
  const setAt = (index: number, next: unknown): void => onChange(list.map((entry, i) => (i === index ? next : entry)));
  const removeAt = (index: number): void => onChange(list.filter((_, i) => i !== index));
  return (
    <div style={block}>
      {list.map((item, index) =>
        // A node item carries its own menu, so removal lives there; a scalar item
        // has no menu, so it keeps the inline ✕.
        itemField.kind === 'self' ? (
          <NodeEditor key={index} value={item} onChange={(next) => setAt(index, next)} onRemove={() => removeAt(index)} />
        ) : (
          <div key={index} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ArgEditor field={itemField} value={item} onChange={(next) => setAt(index, next)} />
            </div>
            <button type="button" style={iconBtn} onClick={() => removeAt(index)}>✕</button>
          </div>
        ),
      )}
      <button type="button" style={addBtn} onClick={() => onChange([...list, defaultItem(itemField)])}>Add</button>
    </div>
  );
};

// The plain-object template: a static target object whose values are nodes. A
// valid config on its own (no op, no conversion), so it is fully editable here:
// add / rename / remove keys, each value its own NodeEditor.
const TemplateEditor: FC<{ value: unknown; onChange: (next: unknown) => void }> = ({ value, onChange }) => {
  const entries = Object.entries(isObj(value) ? value : {});
  const rename = (from: string, to: string): void => {
    if (to === from) return;
    onChange(Object.fromEntries(entries.map(([key, val]) => [key === from ? to : key, val])));
  };
  const addField = (): void => {
    const taken = new Set(entries.map(([key]) => key));
    let key = 'field';
    for (let n = 1; taken.has(key); n += 1) key = `field${n}`;
    onChange({ ...Object.fromEntries(entries), [key]: null });
  };
  return (
    <div style={block}>
      {entries.map(([key, val], index) => (
        <div key={index} style={{ ...rowStyle, alignItems: 'flex-start' }}>
          <input style={{ ...input, width: 150 }} value={key} onChange={(event) => rename(key, event.target.value)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <NodeEditor
              value={val}
              onChange={(next) => onChange(Object.fromEntries(entries.map(([k, v]) => [k, k === key ? next : v])))}
              onRemove={() => onChange(Object.fromEntries(entries.filter(([k]) => k !== key)))}
            />
          </div>
        </div>
      ))}
      <button type="button" style={addBtn} onClick={addField}>Add field</button>
    </div>
  );
};

// ─── The recursive node editor ───────────────────────────────

const NodeEditor: FC<{ value: unknown; onChange: (next: unknown) => void; onRemove?: () => void }> = ({ value, onChange, onRemove }) => {
  const id = kindOf(value);
  const kind = BY_ID.get(id);

  const body = ((): ReactNode => {
    if (kind === undefined) return <JsonEditor value={value} onChange={onChange} />;
    if (kind.category !== 'Value') {
      const arg = argFieldOf(kind.variant);
      if (arg === undefined) return null;
      return <ArgEditor field={arg} value={isObj(value) ? value[id] : undefined} onChange={(next) => onChange({ [id]: next })} />;
    }
    switch (id) {
      case 'string':
        return <input style={input} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />;
      case 'number':
        return <input style={input} type="number" value={Number.isFinite(value) ? (value as number) : ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />;
      case 'boolean':
        return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} style={{ width: 16, height: 16 }} />;
      case 'null':
        return null;
      case 'array':
        return <ListEditor itemField={{ kind: 'self' }} value={value} onChange={onChange} />;
      case 'template':
        return <TemplateEditor value={value} onChange={onChange} />;
      default:
        return <JsonEditor value={value} onChange={onChange} />;
    }
  })();

  const children = unwrapChildren(value);
  return (
    <div style={nested}>
      <div style={rowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <NodeKindChooser current={id} onPick={(next) => onChange(defaultFor(next))} />
        </div>
        <ActionMenu ariaLabel="Restructure">
          <SubMenu label="⧉ Wrap in">
            {WRAP_TARGETS.map((target) => (
              <MenuItem key={target.id} label={target.label} onSelect={() => onChange(wrapInto(target.id, value))} />
            ))}
          </SubMenu>
          {children.length > 0 ? (
            <SubMenu label="⇲ Unwrap">
              {children.map((child, index) => (
                <MenuItem key={index} label={`to ${child.label}`} onSelect={() => onChange(child.node)} />
              ))}
            </SubMenu>
          ) : null}
          {onRemove !== undefined ? <MenuItem label="✕ Remove" onSelect={onRemove} /> : null}
        </ActionMenu>
      </div>
      {body}
    </div>
  );
};

// The role component: bind the whole node to its model, render the recursive
// editor, write the whole node back on any edit.
export const PrismNode: NovaComponent<{ value?: unknown }> = ({ value, novaModel }) => {
  const set = useModelWrite(novaModel);
  return <NodeEditor value={value} onChange={set} />;
};

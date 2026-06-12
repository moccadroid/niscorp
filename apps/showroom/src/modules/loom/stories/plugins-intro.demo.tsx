import type { CSSProperties, FC, ReactNode } from 'react';

// A documentation page (no live demo): a walkthrough of building the `gradient`
// example plugin, from an empty file to a working editor. Plain styled React.

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const page: CSSProperties = { maxWidth: 880, margin: '0 auto', padding: '36px 28px 72px', color: '#1f2937', fontSize: 15.5, lineHeight: 1.65, fontFamily: 'system-ui, sans-serif' };
const h1: CSSProperties = { fontSize: 28, fontWeight: 800, letterSpacing: -0.4, margin: '0 0 10px', color: '#111827' };
const h2: CSSProperties = { fontSize: 19, fontWeight: 700, margin: '40px 0 12px', color: '#111827' };
const para: CSSProperties = { margin: '0 0 14px' };
const inlineCode: CSSProperties = { fontFamily: mono, fontSize: 13.5, background: '#f1f5f9', borderRadius: 4, padding: '1px 5px', color: '#0f172a' };
const liStyle: CSSProperties = { marginBottom: 8 };

const C: FC<{ children: ReactNode }> = ({ children }) => <span style={inlineCode}>{children}</span>;

const CodeBlock: FC<{ children: string }> = ({ children }) => (
  <pre style={{ background: '#1e1e1e', color: '#d4d4d4', borderRadius: 8, padding: '14px 16px', fontSize: 12.5, lineHeight: 1.65, overflowX: 'auto', margin: '0 0 16px', fontFamily: mono, whiteSpace: 'pre' }}>
    {children}
  </pre>
);

const schemaCode = `const gradient = z.object({
  name: z.string().meta({ title: 'Name' }),
  angle: z.number().min(0).max(360).meta({ title: 'Angle' }),
  colors: z.array(z.string()).meta({ title: 'Colours' }),
});`;

const pluginCode = `export const gradient: LoomEditorPlugin = {
  name: 'gradient',
  documents: { gradient },        // the schema, becomes a form
  widgets: [...],                 // swap the input on chosen fields
  mount: (editor) => { ... },     // add things beside the form, e.g. a preview
  components: { ... },            // the on-screen pieces
};`;

const previewCode = "const Preview = ({ gradient }) => {\n  const { colors = [], angle = 90 } = gradient ?? {};\n  const css = `linear-gradient(${angle}deg, ${colors.join(', ')})`;\n  return <div style={{ height: 220, borderRadius: 12, background: css }} />;\n};";

const mountCode = `const previewAction = {
  id: 'gradient:preview',
  layout: { component: 'gradient:preview', props: { gradient: '$.gradient' } },
  data: { gradient: {} },
};

// in the plugin:
mount: (editor) =>
  mountView(editor, previewAction, (e) => ({ gradient: e.documents.gradient })),`;

const swatchCode = `const Swatch = ({ value, novaModel }) => {
  const set = useModelWrite(novaModel);
  return <input type="color" value={value} onChange={(e) => set(e.target.value)} />;
};`;

const matcherCode = "// a colour is any string field whose path ends in `colors.*`\nconst isColor = (field) =>\n  field.kind === 'string' && /(^|\\.)colors\\.\\*$/.test(field.path);\n\n// in the plugin:\nwidgets: [{ role: 'gradient:swatch', match: isColor }],\ncomponents: { 'gradient:swatch': Swatch, 'gradient:preview': Preview },";

const loadingCode = `<LoomEditor
  plugins={[...defaultPlugins(), gradient]}
  artifact={{
    type: 'gradient',
    documents: { gradient: { name: 'Sunset', angle: 120, colors: ['#ff7e5f', '#feb47b'] } },
  }}
/>`;

export const Demo: FC = () => (
  <div style={page}>
    <h1 style={h1}>Building a Loom plugin</h1>

    <h2 style={h2}>Loom turns a schema into a form</h2>
    <p style={para}>
      Loom takes a schema, a description of what your data looks like, and builds an editor for it. If your data is a
      gradient with a name, an angle, and a list of colours, Loom gives you a form with a name field, an angle field, and
      a list of colour fields you can add to and remove from. Type in the form and the data updates. Hand it existing
      data and the form fills in. You write the schema; you never write the form.
    </p>
    <p style={para}>
      This works for anything you can describe: a gradient, a search query, a chart configuration, a page layout. Schema
      in, editable form out, every time.
    </p>

    <h2 style={h2}>Why plugins exist</h2>
    <p style={para}>
      A plain form is not enough for a real editor. While you edit a gradient you want to see the gradient, and you want
      to pick each colour from a colour wheel instead of typing <C>#ff7e5f</C>. If you were editing a database query you
      would want column names to autocomplete, and you would want to run the query and look at the rows.
    </p>
    <p style={para}>
      The schema cannot give you any of that, because it only describes the data, not the experience. A plugin is where
      the experience lives. One plugin handles one kind of document: it names the schema to edit, adds a preview of the
      result, and upgrades the editors for specific fields. Write it once and Loom can edit that kind of document
      properly from then on.
    </p>

    <h2 style={h2}>What a plugin is</h2>
    <p style={para}>A plugin is one object. Four parts, and only the first is required.</p>
    <CodeBlock>{pluginCode}</CodeBlock>
    <ul style={{ margin: '0 0 14px', paddingLeft: 20 }}>
      <li style={liStyle}><C>documents</C> are the schemas to edit; Loom builds a form from each.</li>
      <li style={liStyle}><C>widgets</C> swap the default input on chosen fields for your own.</li>
      <li style={liStyle}><C>mount</C> runs when the plugin loads, to add things next to the form, such as a preview.</li>
      <li style={liStyle}><C>components</C> are the on-screen pieces your widgets and preview use.</li>
    </ul>

    <h2 style={h2}>Building it: the schema</h2>
    <p style={para}>
      Start with the data. A gradient is a name, an angle from 0 to 360, and a list of colours. The <C>title</C> on each
      field becomes its label in the form.
    </p>
    <CodeBlock>{schemaCode}</CodeBlock>
    <p style={para}>
      That schema alone gives you a working form: a Name box, an Angle box, and a Colours list with add and remove.
      Everything from here is making it nicer.
    </p>

    <h2 style={h2}>Add a preview</h2>
    <p style={para}>The preview is an ordinary component. It takes the current gradient and paints it.</p>
    <CodeBlock>{previewCode}</CodeBlock>
    <p style={para}>
      To show it beside the form and keep it current, the plugin mounts it. <C>mountView</C> places the preview and
      re-feeds it the gradient on every edit, so it repaints as you type.
    </p>
    <CodeBlock>{mountCode}</CodeBlock>

    <h2 style={h2}>Give colours a colour picker</h2>
    <p style={para}>
      By default each colour is a text box. Replace it with a colour input. The input reads the field&rsquo;s value and
      writes the new one back.
    </p>
    <CodeBlock>{swatchCode}</CodeBlock>
    <p style={para}>
      Then tell the plugin which fields it replaces. Colours are the items of the <C>colors</C> list, so match a string
      field whose path is a colour. The matched field renders with the component you register under the role.
    </p>
    <CodeBlock>{matcherCode}</CodeBlock>
    <p style={para}>Now every colour in the list is a swatch you click instead of a hex string you type.</p>

    <h2 style={h2}>Run it</h2>
    <p style={para}>Load the plugin into the editor and give it a gradient to start from.</p>
    <CodeBlock>{loadingCode}</CodeBlock>
    <p style={para}>
      <C>defaultPlugins()</C> adds the always-on Data and Validations panes. You get the form and its colour pickers on
      one side and the live preview on the other.
    </p>
  </div>
);

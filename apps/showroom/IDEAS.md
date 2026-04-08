# Showroom — future ideas

A grab-bag of things we could add to the showroom when we're looking for something to do. Not in priority order; not commitments.

## More stories (engine already supports them)

### Bindings — advanced
- Nested `$if` directives — a directive whose `$then` contains another directive. Proves recursive resolution.
- `@error` extras scope — inside an action's `onError` chain, templates read `{{@error.message}}`.
- `set { from }` mutation — copy a value from one path to another (e.g., "save current draft to history").
- Mixed templates — `"Page {{$.page}} of {{$.total}}"` plus a sole-expression `{{$.user.name}}` returning a raw value.
- Numeric coercion — increment by a value typed into an input. Tests the type-conversion story.

### Loops — advanced
- Empty list edge case — `$.items: []` should render nothing without crashing. Show it explicitly.
- `$index` variable — numbered list using the loop scope's `index`.
- Reorder via mutations — three buttons per item: move up, move down, remove.

### Conditionals — advanced
- Conditional inside conditional — if logged in, show admin panel if isAdmin else user panel. Two layers deep.
- Show/hide via toggle — Stack with a "details" section hidden by default; button reveals/collapses. Most common UI pattern in the world.

### Lifecycle — advanced
- All four hooks fire — mount/unmount/suspend/resume each appending to an event log. User navigates to/from the story to see suspend/resume in real time.

### Endpoints — advanced
- Endpoint with templated URL — `'/api/users/{{$.userId}}'`.
- Endpoint with body and headers — POST with a JSON body templated from the data.
- `onSuccess` chain that does mutations + emits — fetch user, set loading false, emit `cache-updated`. Compound triggers.
- `onError` chain with `@error` extras — fetch fails, onError reads `{{@error.message}}`.
- Transform injection — `transform` config option on endpoints lets you reshape responses before they land. Inject a Prism (or any) transform via shell config.

### Errors — more cases
- Endpoint failure with onError — fake fetch returns 500, onError chain runs, error displays, loading cleared.
- Render error in lax mode survives — sibling component throws but its sibling renders fine. Subtree isolation.
- Strict mode failure — action with `strict: true` throws on push. Shows the `pendingStrictError` mechanism.

## Showroom-as-tool ideas (showroom itself gets more powerful)

### Inspector enhancements
- **Diff view in the Render tab** — when data changes, briefly highlight what changed in the resolved tree.
- **History scrubbing** — record the data store at each tick, scrub backwards through every state. Free time-travel because nova's data store is immutable.
- **Event log tab** — show every event the shell received (`ui:click`, `ui:model`, lifecycle, `msg:*`). Per-story. Live.
- **Component tree visualization** — render the RenderNode tree as a collapsible tree widget instead of JSON. Click a node to see its props.
- **Editable data tab** — let the user edit the JSON in the Data tab and write it back to the runtime. Instant testing of "what does this layout look like with `$.loading: true`?" without writing a new story.
- **Performance pane** — render() time per story, RenderNode count, re-render frequency. Catches accidental render storms.

### Author-time tooling
- **Schema-driven prop editor** — for each registered component, show its `propsSchema` in the inspector with editable fields. Like Storybook controls but driven by the actual Zod schema we already have.
- **Layout editor** — edit a story's layout JSON inline and see the canvas update.
- **Action recorder** — start recording, click around in the canvas, get a list of dispatched events back. Could become test fixtures.

## Documentation-style showcase pieces

- **Complete todo app** — add items, check them off, filter by complete/incomplete, clear completed. Uses every primitive and every mutation kind. The "this is what nova looks like in production" story.
- **Form story** — multi-field form with validation via conditionals (`{$if: '$.errors.email', $then: ...}`), submit button calling an endpoint, success/error states. Proves nova can do forms without a Form component primitive.
- **Wizard story** — three-step flow with `replace` between steps, accumulating data across steps.
- **Dashboard story** — multiple cards reading from different paths, refreshing on a timer (lifecycle hook with `setTimeout`?). Read-mostly app shape.

## Scaling the showroom itself

If the story list keeps growing:
- Search in the sidebar — filter by name, category, status.
- URL routing — `/stories/counter` deep-links to a story, browser back/forward works.
- Story metadata — tags, "demonstrates" labels (e.g., "demonstrates: loops, conditionals, model").
- "What's new" page — when nova adds a feature, the story for it gets surfaced as recent.
- Coverage view — which features (by tag) have stories, which don't. The "test suite" framing taken literally.

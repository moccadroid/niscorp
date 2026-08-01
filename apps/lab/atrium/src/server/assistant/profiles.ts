// How much of a person's screen the WATCHER arranges unasked. One row per mode
// of the `staff.layout_control` column, and the dial binds the watcher alone —
// the dock is dial-blind (`chatPlacesFor` below): a person who asks is answered
// with the whole screen they work in.
//
//   places   the canvases the watcher may build. Its answer REBUILDS each of
//            them, so a canvas listed here is one it also closes things on.
//   watches  whether the ambient watcher attaches at all.
//
// Filling is not a mode: writing a declared field into an already-open card
// re-renders nothing, so it is available throughout and bounded in contract.ts.

export type Profile = {
  places: readonly string[];
  watches: boolean;
};

// ─── what is true about a model ──────────────────────────────
//
// TWO TABLES, ONE RELATIONSHIP. `MODELS` is what a person may CHOOSE; `TUNING`
// is what is TRUE about a model whoever chose it. Keyed differently on purpose —
// a choice is a settings value, a truth belongs to the model id — and the second
// must be reachable from a persona row that never went through the picker.
//
// Everything per-model lives here rather than at the place that consumes it:
// transport, budget and reasoning are all facts about a model, and asserting any
// of them globally means asserting it about every model.

// Signal's own capability names. A partial: whatever is not stated keeps the
// provider registry's default. This says what we have VERIFIED about one model,
// never what we hope about a provider.
export type ModelCapabilities = { toolsWithStructuredOutput?: boolean; nativeJsonSchema?: boolean; manglesNestedToolArgs?: boolean };

export type ModelTuning = {
  // Merged over the provider registry's row before transport resolution runs.
  capabilities?: ModelCapabilities;
  // What the ambient watcher may spend. A model that answers in one step and a
  // model that reads first are not the same budget.
  steps: number;
  seconds: number;
  // Whether to let the provider emit a chain of thought. Off sends
  // `reasoning: { enabled: false }`.
  //
  // Off wherever signal cannot read the channel back: its openai-compatible
  // adapter takes `delta.content` and `delta.tool_calls` only, so reasoning
  // tokens are billed and counted but never reach a transcript. A fact about our
  // plumbing rather than about the model.
  reasoning: boolean;
};

const DEFAULT_TUNING: ModelTuning = { steps: 6, seconds: 45, reasoning: true };

// Keyed by MODEL ID, not by choice key: persona rows name models directly and
// never pass through the picker.
const TUNING: Record<string, ModelTuning> = {
  // Verified against the API: GLM 5.2 takes `tools` and `response_format:
  // json_schema` in one request and answers with clean structured content.
  // OpenRouter's registry row defaults false for the whole proxy and tells
  // callers to override per routed model — declaring it is what lets the
  // envelope ride `response_format` with the tools still on the request.
  'z-ai/glm-5.2': { capabilities: { toolsWithStructuredOutput: true }, steps: 12, seconds: 120, reasoning: false },
  // Groq's registry row already describes gpt-oss correctly: no native JSON
  // schema, and it corrupts nested tool args, so signal sends it down `emit`.
  'openai/gpt-oss-120b': { steps: 6, seconds: 45, reasoning: true },
  'llama-3.3-70b-versatile': { steps: 6, seconds: 45, reasoning: true },
};

// Any model, chosen or seeded. An unlisted one gets the conservative default
// rather than an error: a persona row naming something new should run, slowly
// and safely, not take the assistant down.
export const tuningFor = (model: string): ModelTuning => TUNING[model] ?? DEFAULT_TUNING;

// ─── which model, per person ─────────────────────────────────
//
// A BENCH DIAL. `staff.assistant_model` holds one of these KEYS, never a model
// id — provider and model have to move together (`z-ai/glm-5.2` on groq is
// nonsense), so one value names the pair, and free-text ids stay out of the
// database and off the screen. Same shape as PROFILES above, for the same
// reason: the row holds a choice, this file holds what the choice means.
//
// Empty is the house default: the persona row decides, which is the seam that
// ships. Everything here is an override on top of it.

export type ModelChoice = { provider: string; model: string; title: string; blurb: string };

export const MODELS: Record<string, ModelChoice> = {
  '': { provider: '', model: '', title: 'House default', blurb: 'Whatever this assistant is configured to run on.' },
  'glm-5.2': { provider: 'openrouter', model: 'z-ai/glm-5.2', title: 'GLM 5.2', blurb: 'Through OpenRouter. Slower, and reads a situation better.' },
  'gpt-oss-120b': { provider: 'groq', model: 'openai/gpt-oss-120b', title: 'gpt-oss 120b', blurb: 'Through Groq. Fast enough to feel ambient.' },
};

// An unknown key reads as the house default rather than throwing: the row can
// name a model this build no longer ships, and a settings value nobody can spend
// should not take the assistant down.
export const modelOf = (key: string | undefined): ModelChoice => MODELS[key ?? ''] ?? MODELS[''] ?? { provider: '', model: '', title: '', blurb: '' };

export const PROFILES: Record<string, Profile> = {
  authored: { places: [], watches: false },
  mixed: { places: ['aside'], watches: true },
  full: { places: ['work', 'detail', 'aside'], watches: true },
};

const FALLBACK: Profile = PROFILES['mixed'] ?? { places: [], watches: false };

export const profileOf = (layoutControl: string | undefined): Profile => PROFILES[layoutControl ?? 'mixed'] ?? FALLBACK;

// WHERE THE DOCK MAY PLACE, by audience. Not a profile and not the dial's
// business: the dial bounds what the watcher does unasked, and an answer to a
// person is bounded by the screen they work in. A guest holds one overlay
// canvas — everything opened for them goes to the sheet and closes back to
// their home; everyone else works in the three columns.
export const chatPlacesFor = (audience: string): readonly string[] => (audience === 'guest' ? ['sheet'] : ['work', 'detail', 'aside']);

// The territory as one word, for the terminal's region frame: 'all' when every
// working column is the assistant's to arrange, 'aside' when only the side
// column is, 'none' otherwise. Derived from `places` per call, never stored —
// a guest's sheet is an overlay, not territory, and answers 'none'.
export const scopeOf = (places: readonly string[]): 'all' | 'aside' | 'none' =>
  ['work', 'detail', 'aside'].every((canvas) => places.includes(canvas)) ? 'all' : places.includes('aside') ? 'aside' : 'none';

// WHERE THESE THINGS ARE, before what they are for. The canvas ids are
// structural and say nothing about position, so every rule about choosing
// between them is unreadable without this. One shape per screen that exists:
// a clerk's workspace and a guest's phone page are different rooms, and
// describing the wrong one leaves the model reasoning about columns its user
// does not have.
export const STAFF_SCREEN = [
  'The user\'s screen has a menu across the top and three columns under it. The columns are called canvases.',
  '',
  '  work    left column, widest. Holds a list the user works through.',
  '  detail  middle column. Holds one record opened from that list.',
  '  aside   right column. Holds what you offer alongside that record.',
  '',
  '`work` and `detail` show one card at a time. A card placed on either covers the card already there.',
  '`aside` is a list. It shows every card on it, in the order you give them.',
].join('\n');

export const GUEST_SCREEN = [
  'The user\'s screen is a phone page. Two canvases matter here.',
  '',
  '  home    the page itself — a list of cards, one per thing the hotel offers, each showing one live line. The user taps a card to expand it in place.',
  '  sheet   an overlay over the page. Everything you open goes here and closes back to home.',
  '',
  '`sheet` shows one card at a time. A card placed on it covers the card already there.',
].join('\n');

// What each canvas is for. Shown to the model so it can choose between them;
// contract.ts enforces which ones it holds.
//
// A canvas is a STACK, so the next step never goes on `detail`: the record it is
// about is already there, and a card placed on top hides it.
export const COLUMN_NOTES: Record<string, string> = {
  sheet: 'an overlay over the user\'s home screen. Everything you open for a guest goes here and closes back to it.',
  main: 'the user\'s whole screen. Change it only when the user asks to move to a different one.',
  work: 'change it only to move the user to a different list',
  detail: 'put a card here only to change which record the user is reading',
  aside: 'the action you are offering goes here',
};

import type { Answer } from '@showroom/lib/scripted-model/scripts';
import type { ScriptedRequest } from '@showroom/lib/scripted-model/scripted-fetch';

// ═══════════════════════════════════════════════════════════
// What the scripted model says on each signal page when there is no API key.
//
// Each page's opening exchange is a recording of a real run (replayed from its
// snapshot). These are the answers to the prompts each page offers as "Try:"
// chips — written for the page, labelled SCRIPTED in the chat. The signal code
// that sends the request, streams, validates and parses the reply is real.
// ═══════════════════════════════════════════════════════════

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback);

export const PLAIN: readonly Answer[] = [
  { ask: 'What is the capital of Austria?', reply: { text: 'The capital of Austria is **Vienna** (Wien). It sits on the Danube in the east of the country and is home to about two million people.' } },
  {
    ask: 'How many people live in Paris?',
    reply: { text: 'About **2.1 million** people live in the city of Paris itself, and roughly **12 million** in the wider Île-de-France region — one of the largest metropolitan areas in Europe.' },
  },
  { ask: 'Answer in one word: the capital of Japan?', reply: { text: 'Tokyo.' } },
];

export const HAIKU: readonly Answer[] = [
  { ask: 'Describe a yoga class at dawn.', reply: { text: 'Mats unroll in hush —\nfirst light finds the open palms,\nbreath rises like steam.' } },
  { ask: 'Describe Vienna in winter.', reply: { text: 'Snow on the old Ring,\ncoffee steam curls past cold stone —\ntrams hum through the dusk.' } },
  { ask: 'Describe a Monday.', reply: { text: 'Alarm cuts the dark —\nthe kettle argues with me.\nMondays always win.' } },
];

export const TUTOR: readonly Answer[] = [
  {
    ask: 'What does return do?',
    reply: {
      text: '`return` hands a value back to whoever called the function — and stops the function right there.\n\n```javascript\nfunction add(a, b) {\n  return a + b;\n}\n\nconst total = add(2, 3); // total is 5\n```\n\nWithout a `return`, a function gives back `undefined`.',
    },
  },
  {
    ask: 'Can you show the same thing in Python?',
    reply: {
      text: 'Sure — the same greeting function in Python:\n\n```python\ndef greet(name):\n    print("Hello, " + name)\n\ngreet("Alice")  # Hello, Alice\ngreet("Bob")    # Hello, Bob\n```\n\nPython says `def` instead of `function`, and uses indentation instead of curly braces.',
    },
  },
  {
    ask: 'What is a parameter again?',
    reply: { text: 'A **parameter** is the name a function uses for an input — like `name` in `greet(name)`. The actual value you pass when you call it (`"Alice"`) is called an **argument**.' },
  },
];

// The weather tool always reports what its `execute` returns; the model asks
// for the city, then describes whatever came back.
const weather = (city: string, finish: (r: Record<string, unknown>) => string) => (request: ScriptedRequest) => {
  if (request.toolResultsSinceUser === 0) return { call: { name: 'get_weather', args: { city } } };
  const r = isRecord(request.lastToolResult) ? request.lastToolResult : {};
  return { text: finish(r) };
};

export const WEATHER: readonly Answer[] = [
  { ask: 'And in Vienna?', reply: weather('Vienna', (r) => `It's ${str(r['temperature'], '?')}°C and ${str(r['condition'], 'unknown')} in ${str(r['city'], 'Vienna')} right now.`) },
  { ask: "What's the weather in Tokyo?", reply: weather('Tokyo', (r) => `Tokyo is at ${str(r['temperature'], '?')}°C and ${str(r['condition'], 'unknown')} at the moment.`) },
  {
    ask: 'Should I bring an umbrella in London?',
    reply: weather('London', (r) => `London is ${str(r['temperature'], '?')}°C and ${str(r['condition'], 'unknown')} — nothing in the current conditions says rain, so you can probably leave the umbrella at home.`),
  },
];

export const RECIPES: readonly Answer[] = [
  {
    ask: 'A recipe for pancakes for 4 people.',
    reply: {
      data: {
        title: 'Fluffy buttermilk pancakes',
        servings: 4,
        ingredients: [
          { item: 'Plain flour', amount: '250 g' },
          { item: 'Buttermilk', amount: '400 ml' },
          { item: 'Eggs', amount: '2' },
          { item: 'Sugar', amount: '2 tbsp' },
          { item: 'Baking powder', amount: '2 tsp' },
          { item: 'Butter, melted', amount: '40 g' },
          { item: 'Salt', amount: '1 pinch' },
        ],
        steps: [
          'Whisk the flour, sugar, baking powder and salt in a large bowl.',
          'In another bowl, beat the eggs into the buttermilk, then stir in the melted butter.',
          'Pour the wet ingredients into the dry and fold until just combined — a few lumps are fine.',
          'Heat a lightly buttered pan over medium heat and pour in about 60 ml of batter per pancake.',
          'Flip when bubbles form on the surface, cook one more minute, and serve warm.',
        ],
        tags: ['breakfast', 'vegetarian', 'american'],
      },
    },
  },
  {
    ask: 'A quick vegan lunch for 1.',
    reply: {
      data: {
        title: 'Chickpea and spinach wrap',
        servings: 1,
        ingredients: [
          { item: 'Tinned chickpeas, drained', amount: '120 g' },
          { item: 'Baby spinach', amount: '1 handful' },
          { item: 'Tahini', amount: '1 tbsp' },
          { item: 'Lemon juice', amount: '1 tsp' },
          { item: 'Smoked paprika', amount: '1/2 tsp' },
          { item: 'Large tortilla', amount: '1' },
        ],
        steps: [
          'Roughly mash the chickpeas with the tahini, lemon juice and paprika.',
          'Warm the tortilla in a dry pan for 30 seconds.',
          'Spread the chickpea mix down the middle, top with spinach, roll up tightly and slice in half.',
        ],
        tags: ['vegan', 'quick', 'lunch'],
      },
    },
  },
];

export const CARDS: readonly Answer[] = [
  {
    ask: 'A card recommending a yoga studio in Vienna.',
    reply: {
      data: {
        title: 'Acme Studio',
        subtitle: 'Yoga and movement in the old tram depot, Vienna',
        body: 'Small classes, big windows and teachers who learn your name. Try Morning flow before work or wind down with Tuesday’s Evening stretch — first class is free.',
        badges: [
          { label: 'Beginner friendly', tone: 'positive' },
          { label: 'Near U3 Rochusgasse', tone: 'neutral' },
        ],
        actions: [
          { label: 'Book a trial class', intent: 'primary' },
          { label: 'See the timetable', intent: 'secondary' },
        ],
      },
    },
  },
  {
    ask: 'A card warning that a class is almost full.',
    reply: {
      data: {
        title: 'Power hour is almost full',
        subtitle: 'Mon 12:15 · with Olivia',
        body: 'Only two spots are left for Monday’s Power hour. Book now to keep your place, or join the waitlist and we’ll tell you the moment one opens.',
        badges: [
          { label: '2 spots left', tone: 'warning' },
          { label: 'Popular', tone: 'neutral' },
        ],
        actions: [
          { label: 'Book now', intent: 'primary' },
          { label: 'Join the waitlist', intent: 'secondary' },
        ],
      },
    },
  },
];

// The four follow-ups the recorded run suggested — answered in the same shape.
export const FOLLOW_UPS: readonly Answer[] = [
  {
    ask: 'Show me the most popular posts from the last 7 days across all topics and communities.',
    reply: {
      data: {
        reply:
          'Here’s what people engaged with most this week:\n\n1. **“I rebuilt my portfolio in a weekend”** — a before/after thread in Design, 2.4k reactions.\n2. **“The 5-minute morning routine that stuck”** — Wellbeing, 1.9k reactions.\n3. **“Ask me anything: first year as a freelancer”** — Careers, 1.1k comments.',
        suggestions: [
          { label: 'Open the portfolio thread', prompt: 'Open the “I rebuilt my portfolio in a weekend” thread.' },
          { label: 'Only show Design posts', prompt: 'Show me only the most popular Design posts this week.' },
        ],
      },
    },
  },
  {
    ask: 'Suggest 5 topics or communities for me to follow based on my interests.',
    reply: {
      data: {
        reply: 'I don’t know your interests yet, so here are five broad, friendly places to start: **Design**, **Side projects**, **Wellbeing**, **Careers**, and **Show & tell**. Tell me what you enjoy and I’ll narrow it down.',
        suggestions: [
          { label: 'I like design and code', prompt: 'I’m into design and front-end code — what should I follow?' },
          { label: 'Follow all five', prompt: 'Follow all five of those for me.' },
        ],
      },
    },
  },
  {
    ask: 'Help me write a short intro post to share with the community that highlights who I am and what I\'m into.',
    reply: {
      data: {
        reply:
          'Here’s a draft you can tweak:\n\n> Hi all 👋 I’m new here. By day I build things on the web; by night I’m learning to cook properly and failing at sourdough. Looking forward to swapping ideas — say hi if you’re into small side projects!',
        suggestions: [
          { label: 'Make it shorter', prompt: 'Make that intro post shorter — two sentences.' },
          { label: 'Post it', prompt: 'Post that intro to the Introductions community.' },
        ],
      },
    },
  },
  {
    ask: 'Give me a concrete 30-minute daily routine to stay engaged and get the most out of the platform.',
    reply: {
      data: {
        reply: '**10 min** — read your feed and react to three posts you genuinely liked.\n**10 min** — leave one thoughtful comment.\n**10 min** — share something small you made or learned. Do it for a week and your feed will be noticeably better.',
        suggestions: [{ label: 'Remind me daily', prompt: 'Remind me every day at 8pm to do the routine.' }],
      },
    },
  },
];

export const suggestionPrompts = (answers: readonly Answer[]): string[] => answers.map((a) => a.ask);

// ── the streaming pages: one prompt each, streamed token by token ─

const RUST_GUIDE = `# Ownership, borrowing and lifetimes in Rust

Rust manages memory without a garbage collector by following three rules the compiler checks for you.

## 1. Ownership

Every value has exactly one **owner**. When the owner goes out of scope, the value is dropped.

\`\`\`rust
fn main() {
    let s = String::from("hello"); // s owns the string
    let t = s;                     // ownership MOVES to t
    // println!("{s}");            // error: s was moved
    println!("{t}");
}
\`\`\`

## 2. Borrowing

Instead of moving a value, you can **borrow** it with a reference. You may have *either* any number of immutable references (\`&T\`) *or* exactly one mutable reference (\`&mut T\`) — never both at once.

\`\`\`rust
fn len(s: &String) -> usize { s.len() }   // borrows, doesn't take

fn shout(s: &mut String) { s.push('!'); }  // borrows mutably

fn main() {
    let mut s = String::from("hi");
    println!("{}", len(&s));
    shout(&mut s);
}
\`\`\`

The **borrow checker** enforces this at compile time, which is what rules out data races and use-after-free.

## 3. Lifetimes

A lifetime says how long a reference is valid. Usually the compiler infers it; when a function returns a reference, you sometimes spell it out:

\`\`\`rust
fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() > b.len() { a } else { b }
}
\`\`\`

\`'a\` says: the result lives no longer than the shorter of the two inputs.

## Common pitfalls

- **Holding a borrow across a mutation.** Take what you need, end the borrow, then mutate.
- **Returning a reference to a local.** The local dies at the end of the function — return an owned value instead.
- **Cloning to silence the checker.** Sometimes right, often a sign the data wants a different owner.
`;

export const STREAM_TEXT: readonly Answer[] = [
  {
    ask: 'Write a comprehensive guide to ownership, borrowing, and lifetimes in Rust. Cover the borrow checker, mutable vs immutable references, lifetime annotations, and common pitfalls. Include code examples for each concept.',
    reply: { text: RUST_GUIDE },
  },
];

export const STREAM_WIDGET: readonly Answer[] = [
  {
    ask: 'Explain the relationship between gut microbiome diversity and mental health outcomes. Cover the gut-brain axis, key bacterial strains involved, dietary factors, and recent clinical findings. Respond as a widget card with detailed reasoning.',
    reply: {
      data: {
        widget: { type: 'insight', title: 'Gut microbiome and mental health', icon: '🧠' },
        response:
          'The gut and the brain talk to each other constantly through what researchers call the gut–brain axis: the vagus nerve, immune signalling, hormones, and small molecules made by gut bacteria.\n\nA more diverse microbiome has been associated in observational studies with lower rates of depressive symptoms. Some bacterial groups — for example Faecalibacterium and Coprococcus — tend to be less abundant in people with depression, and several bacteria produce short-chain fatty acids that influence inflammation.\n\nDiet is the biggest everyday lever: fibre-rich plants, fermented foods and variety are linked with a more diverse microbiome, while very processed diets are linked with less.\n\nClinical trials of probiotics and dietary changes for mood are promising but small and mixed; the evidence is not yet strong enough to treat them as a therapy.',
        reasoning:
          'The answer separates association from causation because most human data here is observational: people with depression also eat, sleep and take medication differently, and each of those changes the microbiome.\n\nConfidence is moderate: the mechanisms are plausible and animal studies are consistent, but human intervention trials are few and varied.',
        meta: { confidence: 0.68, sources: 12 },
      },
    },
  },
];

export const STREAM_DASHBOARD: readonly Answer[] = [
  {
    ask: 'Show me the Q1 2026 SaaS metrics dashboard for our B2B platform.',
    reply: {
      data: {
        header: { title: 'Q1 2026 — B2B platform', subtitle: 'January 1 – March 31, all regions', status: 'on track' },
        kpis: [
          { label: 'Monthly recurring revenue', value: 482, unit: 'k$', trend: 'up' },
          { label: 'Net revenue retention', value: 112, unit: '%', trend: 'up' },
          { label: 'Logo churn', value: 1.8, unit: '%', trend: 'flat' },
          { label: 'CAC payback', value: 14, unit: 'months', trend: 'down' },
        ],
        alerts: [
          { severity: 'warning', message: 'Two enterprise renewals worth $61k ARR are due in April without a signed quote.' },
          { severity: 'info', message: 'Self-serve sign-ups rose 23% after the pricing page change on March 4.' },
          { severity: 'critical', message: 'Support first-response time breached the 4-hour SLA on 9 days this quarter.' },
        ],
        recommendations: [
          { priority: 1, action: 'Assign an owner to each April enterprise renewal this week.', impact: 'Protects ~$61k ARR.' },
          { priority: 2, action: 'Add one support hire for the EU morning shift.', impact: 'Brings first response back under 4 hours.' },
          { priority: 3, action: 'Extend the new pricing page to the annual plans.', impact: 'Likely lifts annual conversion.' },
        ],
      },
    },
  },
];

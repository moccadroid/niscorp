export type Recipe = {
  id: string;
  /** The problem, in the words somebody would use to complain about it. */
  title: string;
  /** Why it is worth doing — one sentence, not a feature description. */
  why: string;
  icon: string;
  moment: string;
  effect: string;
  run_at: string;
  days: number;
  subject: string;
  body: string;
};

// ONE RECIPE PER MOMENT, and none that cannot run.
//
// There were seven, and three of them named moments the automation principal
// is not granted to read — so "Set it up" produced a row that was refused by
// the engine every single time it fired. `renewal` was the worst of them: it
// reads `plans`, the rung has no `plans.read`, and nothing anywhere said so
// until the reflex ran and parked. A recipe is an offer, and an offer that
// cannot be honoured is worse than an empty list.
//
// Every one below was driven through the engine against real data and watched
// to select real people before it was written down here.
export const RECIPES: readonly Recipe[] = [
  {
    id: 'welcome',
    title: 'Welcome somebody the day they join',
    why: 'The first week decides whether there is a second year, and right now a new member hears nothing from the studio at all.',
    icon: 'star',
    moment: 'member.joined',
    effect: 'email',
    run_at: '09:00',
    days: 7,
    subject: 'Welcome to the studio',
    body: 'We are glad you are here. Come a few minutes early to your first class and somebody will show you around.',
  },
  {
    id: 'enquiry-reply',
    title: 'Answer an enquiry while they are still interested',
    why: 'Somebody asked about joining and is waiting. An hour later they have asked somewhere else.',
    icon: 'inbox',
    moment: 'enquiry.recorded',
    effect: 'email',
    run_at: '09:00',
    days: 7,
    subject: 'Thanks for getting in touch',
    body: 'Thanks for asking about training with us. Come in any time this week and try a class — no charge, no commitment.',
  },
  {
    id: 'trial-ending',
    title: 'Catch a trial before it runs out',
    why: 'A trial that ends quietly is a member you never had. This is the conversation, a few days early.',
    icon: 'clock',
    moment: 'trial.ending',
    effect: 'email',
    run_at: '09:00',
    days: 3,
    subject: 'Your trial is nearly up',
    body: 'We would love to keep you on the mat — come and talk to us about a plan.',
  },
  {
    id: 'winback',
    title: 'Notice somebody who has stopped coming',
    why: 'They are still paying and they have not been in for weeks. Nobody sees it until they cancel.',
    icon: 'heart',
    moment: 'member.quiet',
    effect: 'email',
    run_at: '08:00',
    days: 21,
    subject: 'We have missed you',
    body: 'It has been a while. Nothing has changed and your place is still here.',
  },
  {
    id: 'class-tomorrow',
    title: 'Remind people the day before their class',
    why: 'Empty spots that somebody booked and forgot are the cheapest attendance a studio can buy back.',
    icon: 'calendar',
    moment: 'class.tomorrow',
    effect: 'email',
    run_at: '18:00',
    days: 7,
    subject: 'See you tomorrow',
    body: 'You are booked in.',
  },
];

export const recipeById = (id: string): Recipe | undefined => RECIPES.find((r) => r.id === id);

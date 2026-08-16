// The automation vocabulary, projected from the shipped constants into rows.
import { insert } from '../sql';
import { EFFECTS, MOMENTS } from '@lyra/app/reflexes/compose';
import { RECIPES } from '@lyra/app/reflexes/recipes';
import { AUDIENCES } from '@lyra/app/vex/campaign.entries';

// PROJECTED FROM THE SHIPPED CONSTANTS, never typed twice. A moment's
// behaviour is code — its `watch` anchor and its `context` are functions —
// but everything a SCREEN says about it is presentation, and presentation
// belongs in rows where a vex entry can join it and compose a sentence on
// the way out. This is the same move `themes` made, for the same reason.
//
// It is generated here rather than upserted at boot because this is where
// rows come from: the database is rebuilt from this file every start, so
// there is exactly one moment in the lifecycle where the projection could
// drift, and it does not exist.
export const VOCABULARY_SQL = [
  insert(
    'automation_moments',
    ['id', 'phrase', 'blurb', 'watched', 'days_label', 'sort'],
    MOMENTS.map((moment, index) => [moment.id, moment.label, moment.blurb, moment.watch !== undefined, moment.daysLabel ?? '', index]),
  ),
  insert(
    'automation_effects',
    ['id', 'phrase', 'blurb', 'subject_label', 'body_label', 'message_hint', 'sort'],
    EFFECTS.map((effect, index) => [
      effect.id,
      effect.label,
      effect.blurb,
      effect.words?.subject ?? '',
      effect.words?.body ?? '',
      effect.words?.hint ?? '',
      index,
    ]),
  ),
  insert(
    'automation_recipes',
    ['id', 'title', 'why', 'icon', 'moment', 'effect', 'run_at', 'days', 'subject', 'body', 'sort'],
    RECIPES.map((recipe, index) => [
      recipe.id,
      recipe.title,
      recipe.why,
      recipe.icon,
      recipe.moment,
      recipe.effect,
      recipe.run_at,
      recipe.days,
      recipe.subject,
      recipe.body,
      index,
    ]),
  ),
  // THE QUESTIONS A STUDIO MAY ASK OF ITS OWN ROLL, from the same declaration
  // the queries are built from — so the dropdown an owner chooses from and the
  // filter that decides who receives the mail cannot come apart. A campaign's
  // foreign key lands on these rows, which is what makes an audience nobody
  // shipped unstorable rather than merely unselectable.
  insert(
    'campaign_audiences',
    ['id', 'phrase', 'blurb', 'windowed', 'sort'],
    AUDIENCES.map((audience, index) => [audience.id, audience.phrase, audience.blurb, audience.windowed, index]),
  ),
].join('\n');

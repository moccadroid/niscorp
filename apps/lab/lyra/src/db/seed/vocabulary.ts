import { insert } from '../sql';
import { EFFECTS, MOMENTS } from '@lyra/app/reflexes/compose';
import { RECIPES } from '@lyra/app/reflexes/recipes';
import { AUDIENCES } from '@lyra/app/vex/campaign.entries';

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
  insert(
    'campaign_audiences',
    ['id', 'phrase', 'blurb', 'windowed', 'sort'],
    AUDIENCES.map((audience, index) => [audience.id, audience.phrase, audience.blurb, audience.windowed, index]),
  ),
].join('\n');

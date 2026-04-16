import type { CortexStory } from './story-types';

// standalone (5)
import { story as extractAdaStory } from './stories/standalone/extract-ada.story';
import { story as extractTuringStory } from './stories/standalone/extract-turing.story';
import { story as fullNameAgeStory } from './stories/standalone/full-name-age.story';
import { story as productSummaryStory } from './stories/standalone/product-summary.story';
import { story as flattenContactStory } from './stories/standalone/flatten-contact.story';

// tool-use (2)
import { story as weatherMultiCityStory } from './stories/tool-use/weather-multi-city.story';
import { story as budgetFailStory } from './stories/tool-use/budget-fail.story';

// plan-mode (3)
import { story as greeterStory } from './stories/plan-mode/greeter.story';
import { story as analyzerStory } from './stories/plan-mode/analyzer.story';
import { story as directorStory } from './stories/plan-mode/director.story';

// rules (7)
import { story as rateLimitedResearchStory } from './stories/rules/rate-limited-research.story';
import { story as supportEscalationStory } from './stories/rules/support-escalation.story';
import { story as factBudgetStory } from './stories/rules/fact-budget.story';
import { story as dbCompoundStory } from './stories/rules/db-compound.story';
import { story as multiRuleStory } from './stories/rules/multi-rule.story';
import { story as researchDeskStory } from './stories/rules/research-desk.story';
import { story as quickResearchStory } from './stories/rules/quick-research.story';

// confirmation (2)
import { story as approveTransferStory } from './stories/confirmation/approve-transfer.story';
import { story as denyTransferStory } from './stories/confirmation/deny-transfer.story';

export const stories: readonly CortexStory[] = [
  // STANDALONE
  extractAdaStory,
  extractTuringStory,
  fullNameAgeStory,
  productSummaryStory,
  flattenContactStory,
  // TOOL USE
  weatherMultiCityStory,
  budgetFailStory,
  // PLAN MODE
  greeterStory,
  analyzerStory,
  directorStory,
  // RULES
  rateLimitedResearchStory,
  supportEscalationStory,
  factBudgetStory,
  dbCompoundStory,
  multiRuleStory,
  researchDeskStory,
  quickResearchStory,
  // CONFIRMATION
  approveTransferStory,
  denyTransferStory,
];

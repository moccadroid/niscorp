import type { FC } from 'react';
import { RecipeRunner } from './runners/recipe-runner';

// ═══════════════════════════════════════════════════════════
// Runner — discriminator. Signal currently has one story kind
// (recipe), so this is a thin passthrough. Kept as a separate
// file to mirror the nova/prism module shape.
// ═══════════════════════════════════════════════════════════

type Props = { story: unknown };

export const Runner: FC<Props> = ({ story }) => <RecipeRunner story={story} />;

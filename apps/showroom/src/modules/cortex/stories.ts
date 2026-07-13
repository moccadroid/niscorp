import type { Story } from '@showroom/modules/types';
import { story as chat } from './stories/chat.story';
import { story as extract } from './stories/extract.story';
import { story as preview } from './stories/preview.story';
import { story as toolLoop } from './stories/tool-loop.story';
import { story as approval } from './stories/approval.story';
import { story as asTool } from './stories/as-tool.story';

export const stories: readonly Story[] = [chat, extract, preview, toolLoop, approval, asTool];

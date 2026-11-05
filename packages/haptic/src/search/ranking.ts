import { z } from 'zod';

export const RankingOutputSchema = z
  .object({
    rankedIds: z
      .array(z.string().min(1))
      .describe(
        'Candidate IDs in visit order, strongest first, up to maxResults. Select fewer or none when the remaining candidates are not useful for the request.',
      ),
  })
  .strict();

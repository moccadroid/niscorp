// Weather agent + the get_weather tool. Used by the tool-use
// stories. Demonstrates Cortex's tool loop end-to-end: agent
// decides which tool calls to make, Cortex validates each call's
// input against the tool's Zod schema, results become observations,
// agent finalizes a structured WeatherReport.

import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';

const WEATHER_TABLE: Record<string, { tempC: number; condition: string }> = {
  Berlin: { tempC: 4, condition: 'overcast' },
  Paris: { tempC: 7, condition: 'light rain' },
  London: { tempC: 6, condition: 'foggy' },
  Tokyo: { tempC: 12, condition: 'clear' },
  'New York': { tempC: 2, condition: 'snow' },
  Sydney: { tempC: 24, condition: 'sunny' },
};

export const getWeatherTool = defineTool({
  id: 'demo.get_weather',
  name: 'get_weather',
  description:
    'Returns the current weather for a city. Available cities: Berlin, Paris, London, Tokyo, New York, Sydney. Hardcoded fake data for the demo — always succeeds for these cities, throws for any other.',
  riskLevel: 'low',
  input: z.object({
    city: z
      .string()
      .describe('City name. One of: Berlin, Paris, London, Tokyo, New York, Sydney.'),
  }),
  execute: async ({ city }) => {
    const found = WEATHER_TABLE[city];
    if (!found) throw new Error(`no weather data for "${city}" — supported cities: ${Object.keys(WEATHER_TABLE).join(', ')}`);
    return { city, ...found };
  },
});

export const WeatherReportSchema = z
  .object({
    reports: z
      .array(
        z.object({
          city: z.string().describe('City name as the user wrote it.'),
          tempC: z.number().describe('Temperature in degrees Celsius.'),
          condition: z.string().describe('Brief weather condition, e.g. "overcast".'),
        }),
      )
      .describe('One report per city the user asked about, in the order they were mentioned.'),
  })
  .strict();

export type WeatherReport = z.infer<typeof WeatherReportSchema>;

export const weatherAgent = defineAgent<WeatherReport>({
  id: 'demo.weather',
  name: 'Weather Agent',
  description: 'Looks up weather for cities the user asks about and returns a structured report.',
  instructions:
    'You are a weather assistant. The user will mention one or more cities. ' +
    'For EACH city the user mentions, call the get_weather tool with that exact city name. ' +
    'After collecting all results, return a JSON object with the EXACT shape:\n' +
    '  {"reports":[{"city":"<name>","tempC":<number>,"condition":"<string>"}, ...]}\n' +
    'The top-level field is "reports" — an ARRAY of objects, NOT an object keyed by city name. ' +
    'One reports entry per city, in the order the user mentioned them. ' +
    'Return ONLY the JSON, no prose, no markdown fences.',
  outputMode: 'structured',
  outputSchema: WeatherReportSchema,
  tools: ['demo.get_weather'],
});

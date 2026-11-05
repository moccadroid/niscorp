import { z } from 'zod';
import { useNamespaces, type SelectReturnType } from 'xpath';
import { defineOperation } from '../engine/operation.js';
import { OperationFailure, RunControl } from '../engine/control.js';
import type { Operations, JsonValue } from '../engine/contracts.js';
import { HttpSourceSchema } from './http-source.js';
import { readXml, readXmlProfile } from '../readers/xml/index.js';

const recordKey = z
  .string()
  .min(1)
  .regex(/^(?!__proto__$)/, '__proto__ is not supported as an XML rule record key');
const stringRecord = z.preprocess(
  (input, context) => {
    if (input !== null && typeof input === 'object' && Object.hasOwn(input, '__proto__')) {
      context.addIssue({
        code: 'custom',
        message: '__proto__ is not supported as an XML rule record key',
      });
      return z.NEVER;
    }
    return input;
  },
  z.record(recordKey, z.string().min(1)),
);
export const XmlSelectionSchema = z
  .object({
    selector: z
      .string()
      .min(1)
      .describe('XPath 1.0 selecting the record elements in source order.'),
    namespaces: stringRecord.describe(
      'XPath prefix to namespace URI bindings. Use explicit bindings for namespaced elements, including a source default namespace; XPath prefixes need not match source prefixes. Use {} for unnamespaced XML. The reserved __proto__ record key is unsupported.',
    ),
    fields: stringRecord.describe(
      'Arbitrary field names mapped to XPath 1.0 expressions evaluated relative to each selected element. string(...) returns a scalar string, boolean(...) a boolean; node-set expressions return all their string values as an array. The reserved __proto__ record key is unsupported.',
    ),
  })
  .strict();

export const createXmlOperations = (profileInput: unknown, maxJsonDepth: number): Operations => {
  const profile = readXmlProfile(profileInput);
  return {
    'xml.inspect': defineOperation({
      maxJsonDepth,
      input: z.object({ source: HttpSourceSchema }).strict(),
      output: z.object({ url: z.url(), xml: z.string(), encoding: z.string() }).strict(),
      run({ source }, { signal }) {
        const { xml, encoding } = readXml(source, profile, signal);
        return { url: source.url, xml, encoding };
      },
    }),
    'xml.select': defineOperation({
      maxJsonDepth,
      input: z.object({ source: HttpSourceSchema, rule: XmlSelectionSchema }).strict(),
      output: z.object({ url: z.url(), items: z.array(z.record(z.string(), z.json())) }).strict(),
      run({ source, rule }, { signal }) {
        const { document } = readXml(source, profile, signal);
        const evaluate = useNamespaces(rule.namespaces);
        const query = (expression: string, node: globalThis.Node): SelectReturnType => {
          signal.throwIfAborted();
          try {
            return evaluate(expression, node);
          } catch (error) {
            if (error instanceof Error)
              throw new OperationFailure('XML_XPATH', expression + ': ' + error.message);
            throw error;
          }
        };
        const selected = query(rule.selector, document);
        if (!Array.isArray(selected) || selected.some((node) => node.nodeType !== 1))
          throw new OperationFailure(
            'XML_XPATH_TYPE',
            'The record selector must return element nodes',
          );
        if (selected.length > profile.maxSelectedItems)
          throw new RunControl('XML_LIMIT', 'XML selected-item allowance exceeded');
        let fieldValues = 0;
        let fieldBytes = 0;
        const consumeBytes = (value: string): void => {
          fieldBytes += Buffer.byteLength(value);
          if (fieldBytes > profile.maxFieldBytes)
            throw new RunControl('XML_FIELD_BYTES', 'XML field-byte allowance exceeded');
        };
        const consumeValue = (value: string | number | boolean): void => {
          if (++fieldValues > profile.maxFieldValues)
            throw new RunControl('XML_FIELD_VALUES', 'XML field-value allowance exceeded');
          consumeBytes(String(value));
        };
        const items = selected.map((node) =>
          Object.fromEntries(
            Object.entries(rule.fields).map(([name, expression]) => {
              consumeBytes(name);
              const value = query(expression, node);
              let result: JsonValue;
              if (Array.isArray(value)) {
                if (value.length > profile.maxSelectedItems)
                  throw new RunControl('XML_LIMIT', 'XML field-value allowance exceeded');
                result = value.map((item) => {
                  const text = query('string(.)', item);
                  if (typeof text !== 'string')
                    throw new OperationFailure('XML_XPATH_TYPE', 'Expected XPath string value');
                  consumeValue(text);
                  return text;
                });
              } else if (
                typeof value === 'string' ||
                typeof value === 'boolean' ||
                (typeof value === 'number' && Number.isFinite(value))
              ) {
                consumeValue(value);
                result = value;
              } else
                throw new OperationFailure(
                  'XML_XPATH_TYPE',
                  'Field expression must return a node-set, string, boolean or finite number',
                );
              return [name, result];
            }),
          ),
        );
        signal.throwIfAborted();
        return { url: source.url, items };
      },
    }),
  };
};

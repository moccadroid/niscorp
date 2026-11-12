import { DOMImplementation, Node as XmlNode } from '@xmldom/xmldom';
import { SaxesParser } from 'saxes';
import { z } from 'zod';
import { OperationFailure, RunControl } from '../../engine/control.js';
import { readSourceBody, type HttpSourceSchema } from '../../web/source.js';
import { decodeXml } from './decode.js';
import type { XmlProfile } from './profile.schema.js';
export { readXmlProfile, XmlProfileSchema } from './profile.schema.js';

// The XPath package types browser Node; its DOM Level 2 runtime also accepts xmldom.
const xpathNode = z.custom<globalThis.Node>((value) => value instanceof XmlNode);
export const readXml = (
  source: z.infer<typeof HttpSourceSchema>,
  profile: XmlProfile,
  signal: AbortSignal,
): { xml: string; encoding: string; document: globalThis.Node } => {
  signal.throwIfAborted();
  const bytes = readSourceBody(source);
  if (bytes.length > profile.maxInputBytes)
    throw new RunControl('XML_LIMIT', 'XML input byte allowance exceeded');
  const decoded = decodeXml(bytes, source.headers);
  const document = new DOMImplementation().createDocument(null, '');
  let current: XmlNode = document,
    count = 1,
    depth = 0;
  const allow = (nodes: number, level: number): void => {
    signal.throwIfAborted();
    count += nodes;
    if (count > profile.maxNodes || level > profile.maxDepth)
      throw new RunControl('XML_LIMIT', 'XML node or depth allowance exceeded');
  };
  const append = (node: XmlNode): void => {
    allow(1, depth + 1);
    current.appendChild(node);
  };
  const parser = new SaxesParser({ xmlns: true });
  parser.on('error', (error) => {
    throw new OperationFailure('XML_PARSE', error.message);
  });
  parser.on('doctype', () => {
    throw new OperationFailure(
      'XML_UNSUPPORTED',
      'DTD declarations are not supported; external entities are never fetched',
    );
  });
  parser.on('opentag', (tag) => {
    const attributes = Object.values(tag.attributes);
    allow(attributes.length, depth + 1);
    const element = document.createElementNS(tag.uri, tag.name);
    for (const attribute of attributes)
      element.setAttributeNS(attribute.uri, attribute.name, attribute.value);
    append(element);
    current = element;
    depth++;
  });
  parser.on('closetag', () => {
    current = current.parentNode ?? document;
    depth--;
  });
  parser.on('text', (text) => {
    if (current !== document) append(document.createTextNode(text));
  });
  parser.on('cdata', (text) => append(document.createCDATASection(text)));
  parser.on('comment', (text) => append(document.createComment(text)));
  parser.on('processinginstruction', ({ target, body }) =>
    append(document.createProcessingInstruction(target, body)),
  );
  parser.write(decoded.xml).close();
  signal.throwIfAborted();
  return { ...decoded, document: xpathNode.parse(document) };
};

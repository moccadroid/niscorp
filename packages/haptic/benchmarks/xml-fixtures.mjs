import assert from 'node:assert/strict';
import { MIMEType } from 'node:util';
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { useNamespaces } from 'xpath';
import { readXml, readXmlProfile } from '../dist/readers/xml/index.js';
import { captureBody } from '../dist/operations/http-source.js';

// Benchmark-only DOM mutations. Neither these choices nor grading rules reach discovery.
export const mutateXmlSource = (source, variant, signal) => {
  let { document } = readXml(source, readXmlProfile(), signal);
  const select = useNamespaces(variant.namespaces ?? {});
  const nodes = (expression) => {
    const result = select(expression, document);
    assert(Array.isArray(result), 'Fixture mutation needs a node-set');
    return result;
  };
  for (const change of variant.changes ?? []) {
    const matches = nodes(change.select);
    assert(matches.length, 'Fixture change matched nothing: ' + change.select);
    for (const node of matches) {
      if (node.nodeType === 2) node.value = change.text;
      else node.textContent = change.text;
    }
  }
  for (const addition of variant.append ?? []) {
    const parents = nodes(addition.select);
    assert(parents.length, 'Fixture append parent missing');
    const body = captureBody(Buffer.from(addition.xml));
    const added = readXml(
      {
        ...source,
        headers: { 'content-type': ['application/xml; charset=utf-8'] },
        encoded: body,
        body,
      },
      readXmlProfile(),
      signal,
    ).document.documentElement;
    for (const parent of parents) parent.appendChild(document.importNode(added, true));
  }
  for (const expression of variant.remove ?? []) {
    const matches = nodes(expression);
    assert(matches.length, 'Fixture removal matched nothing');
    for (const node of matches) node.parentNode.removeChild(node);
  }
  if (variant.namespace) {
    const { from, to, prefix } = variant.namespace;
    const target = new DOMImplementation().createDocument(null, '');
    const copy = (node) => {
      if (node.nodeType !== 1) return target.importNode(node, true);
      const changed = (node.namespaceURI ?? '') === from;
      const element = target.createElementNS(
        changed ? to : node.namespaceURI,
        changed ? prefix + ':' + node.localName : node.nodeName,
      );
      for (const attribute of Array.from(node.attributes)) {
        if (attribute.namespaceURI === 'http://www.w3.org/2000/xmlns/' && attribute.value === from)
          continue;
        const renamed = from !== '' && attribute.namespaceURI === from;
        element.setAttributeNS(
          renamed ? to : attribute.namespaceURI,
          renamed ? prefix + ':' + attribute.localName : attribute.name,
          attribute.value,
        );
      }
      if (changed) element.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:' + prefix, to);
      for (const child of Array.from(node.childNodes)) element.appendChild(copy(child));
      return element;
    };
    for (const child of Array.from(document.childNodes)) target.appendChild(copy(child));
    document = target;
  }
  const body = captureBody(Buffer.from(new XMLSerializer().serializeToString(document)));
  const media = new MIMEType(source.headers['content-type'][0]);
  media.params.set('charset', 'utf-8');
  const headers = {
    ...source.headers,
    'content-type': [media.toString()],
    'content-length': [String(body.bytes)],
  };
  delete headers['content-encoding'];
  const mutated = { ...source, headers, encoded: body, body };
  readXml(mutated, readXmlProfile(), signal);
  return mutated;
};

import { describe, expect, it } from 'vitest';
import { visitorReader } from '../src/socket';

describe('what a function is told of the visitor', () => {
  it('told no header, the IP is the address at the other end of the socket', () => {
    expect(visitorReader({})({ peer: '203.0.113.7', headers: { 'x-real-ip': '198.51.100.2' } })).toEqual({ ip: '203.0.113.7', headers: {} });
  });

  it('an IPv4 address written as IPv6 is told as IPv4; IPv6 is told whole', () => {
    const read = visitorReader({});
    expect(read({ peer: '::ffff:203.0.113.7', headers: {} })?.ip).toBe('203.0.113.7');
    expect(read({ peer: '2001:db8::1', headers: {} })?.ip).toBe('2001:db8::1');
  });

  it('told a header, the IP is that header’s, whatever its case, and the socket’s address is never used', () => {
    const read = visitorReader({ ipHeader: 'X-Real-IP' });
    expect(read({ peer: '10.0.0.1', headers: { 'x-real-ip': '198.51.100.2' } })?.ip).toBe('198.51.100.2');
    expect(read({ peer: '10.0.0.1', headers: {} })?.ip).toBeNull();
  });

  it('a header that is not exactly one IP is no IP', () => {
    const read = visitorReader({ ipHeader: 'x-forwarded-for' });
    for (const written of ['198.51.100.2, 10.0.0.1', 'unknown', '', '198.51.100.300']) {
      expect(read({ peer: '10.0.0.1', headers: { 'x-forwarded-for': written } })?.ip).toBeNull();
    }
    expect(read({ peer: '10.0.0.1', headers: { 'x-forwarded-for': ['198.51.100.2', '198.51.100.3'] } })?.ip).toBeNull();
  });

  it('keeps the headers the app listed, by lowercase name, and only those the request carried', () => {
    const read = visitorReader({ headers: ['Accept-Language', 'sec-gpc'] });
    const visitor = read({ peer: '203.0.113.7', headers: { 'accept-language': 'de-AT,de;q=0.9', 'user-agent': 'Firefox', cookie: 'a=b' } });
    expect(visitor?.headers).toEqual({ 'accept-language': 'de-AT,de;q=0.9' });
  });

  it('a request a transport handed no headers of is no visitor', () => {
    expect(visitorReader({})(undefined)).toBeNull();
    expect(visitorReader({})({ peer: '203.0.113.7' })).toBeNull();
  });

  it('what a function is told cannot be changed by it', () => {
    const visitor = visitorReader({ headers: ['accept-language'] })({ peer: '203.0.113.7', headers: { 'accept-language': 'en' } });
    expect(() => {
      (visitor?.headers as Record<string, string>)['accept-language'] = 'de';
    }).toThrow();
    expect(() => {
      (visitor as { ip: string | null }).ip = '10.0.0.1';
    }).toThrow();
  });
});

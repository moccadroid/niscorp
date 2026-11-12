import { load } from 'cheerio';

// A decoy: one link address shared by at least 3 links that each show a different text, as when every download
// points at one placeholder page and a page script sets the real addresses.
export const showsDecoyLinks = (html: string): boolean => {
  const $ = load(html);
  const textsByAddress = new Map<string, Set<string>>();
  $('a[href]').each((_, anchor) => {
    const address = ($(anchor).attr('href') ?? '').trim();
    if (!address || address.startsWith('#') || /^javascript:/i.test(address)) return;
    const texts = textsByAddress.get(address) ?? new Set<string>();
    texts.add($(anchor).text().replace(/\s+/g, ' ').trim().toLowerCase());
    textsByAddress.set(address, texts);
  });
  return [...textsByAddress.values()].some((texts) => texts.size >= 3);
};

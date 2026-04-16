import { useEffect, useState } from 'react';

// Returns true when the viewport is narrower than `breakpoint` (px).
// Drives whether the chrome collapses sidebar + inspector into
// overlay drawers vs. the three-pane desktop layout.
export const useIsMobile = (breakpoint: number = 900): boolean => {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent): void => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    setMatches(mql.matches);
    return (): void => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
};

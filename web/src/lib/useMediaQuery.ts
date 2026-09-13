import { useEffect, useState } from 'react';

/**
 * Tracks a media query in React state.
 *
 * Layout alone can hide a pane, but some behaviour has to differ by size too:
 * on a phone the conversation list and the thread are separate screens, so the
 * app must not auto-open a channel the way it does on a wide layout.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * Matches Tailwind's `lg` breakpoint, where the dense grids — the four-column
 * task board and the seven-day roster — have room to be readable.
 */
export function useIsWideLayout(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/**
 * Matches Tailwind's `md` breakpoint. A list beside a detail pane needs far
 * less width than a grid does, so messaging splits a whole breakpoint earlier
 * than the boards: a portrait tablet shows conversations and the thread at once.
 */
export function useIsSplitLayout(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

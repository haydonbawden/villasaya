import { useEffect } from 'react';

const SUFFIX = 'Villa Saya';

/**
 * Sets the document title for a screen.
 *
 * Every route previously shared one title, which makes browser tabs, history
 * and screen-reader page announcements useless once more than one screen is
 * open.
 */
export function usePageTitle(title?: string | null, context?: string | null): void {
  useEffect(() => {
    const parts = [title, context, SUFFIX].filter(Boolean);
    document.title = parts.join(' · ');
    return () => {
      document.title = SUFFIX;
    };
  }, [title, context]);
}

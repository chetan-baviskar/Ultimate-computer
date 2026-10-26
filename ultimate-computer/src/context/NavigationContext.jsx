import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const NavigationContext = createContext(null);

/**
 * Session-history aware navigation for the app's `activePage` state.
 *
 * The site keeps its existing state based routing (`activePage`), but every page
 * change is now also pushed onto the browser session history as a hash URL
 * (for example `#/about`). This means:
 *
 * - The browser Back / Forward buttons move between the pages of this website
 *   instead of leaving it.
 * - A refresh, a shared link or a deep link (`/#/courses`) opens the same page
 *   again, because the current page is always encoded in the URL.
 * - Hash URLs are used on purpose: the fragment never reaches the server, so
 *   this works on every static host (Render, Vercel, ...) without any
 *   server-side rewrite rules.
 *
 * Each history entry also stores `{ ucPage, ucIndex }` where `ucIndex` is how
 * many pages deep the visitor is inside the website (0 = first page), which is
 * what lets the visible Back button fall back to Home instead of leaving the
 * site when there is no previous page.
 */

/** Page id -> URL hash ("about" -> "#/about"). */
const pageToHash = (page) => `#/${page}`;

/** Current URL hash -> page id ("" or "#/" or "#home" -> "home"). */
const getPageFromHash = () => {
  const page = (window.location.hash || '').replace(/^#\/?/, '').trim();
  return page || 'home';
};

export const NavigationProvider = ({ children }) => {
  // Deep link support: start on whatever page the URL points at.
  const [activePage, setActivePageState] = useState(() => getPageFromHash());
  const pageRef = useRef(activePage);
  // Position inside the stack of website pages visited in this tab (0 = first).
  const indexRef = useRef(0);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // Mark the entry the visitor landed on as the first page of the website.
    window.history.replaceState(
      { ...(window.history.state || {}), ucPage: pageRef.current, ucIndex: 0 },
      ''
    );

    // Browser Back / Forward (and manual hash edits): restore the page state
    // from the history entry that the browser just moved to.
    const syncWithHistory = (event) => {
      const state = (event && event.state) || null;
      const page =
        state && typeof state.ucPage === 'string' ? state.ucPage : getPageFromHash();

      // Only entries created by this app carry `ucIndex`. `HashChangeEvent`
      // (fired right after `popstate` for every hash URL) has no `state` at
      // all, so treating a missing value as "depth 0" used to reset the stack
      // on each Back / Forward press, which broke in-site history navigation.
      // Unknown entries keep the last known depth, which can never be deeper
      // than the entry we are on, so `goBack()` still cannot leave the site.
      if (state && typeof state.ucIndex === 'number') {
        indexRef.current = state.ucIndex;
      }

      setCanGoBack(indexRef.current > 0);

      if (page !== pageRef.current) {
        pageRef.current = page;
        setActivePageState(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    window.addEventListener('popstate', syncWithHistory);
    window.addEventListener('hashchange', syncWithHistory);

    return () => {
      window.removeEventListener('popstate', syncWithHistory);
      window.removeEventListener('hashchange', syncWithHistory);
    };
  }, []);

  /**
   * Navigate to a page. Same signature as the previous `setActivePage` state
   * setter so every existing caller keeps working unchanged, but it now also
   * records a history entry (and skips duplicates when already on that page).
   */
  const setActivePage = useCallback((page) => {
    if (!page || page === pageRef.current) return;

    const nextIndex = indexRef.current + 1;
    window.history.pushState({ ucPage: page, ucIndex: nextIndex }, '', pageToHash(page));
    indexRef.current = nextIndex;
    setCanGoBack(true);
    pageRef.current = page;
    setActivePageState(page);
  }, []);

  /**
   * Go back one page inside the website. When there is no previous page
   * (the visitor landed directly on this page), go to Home instead of leaving
   * the website.
   */
  const goBack = useCallback(() => {
    if (indexRef.current > 0) {
      window.history.back();
      return;
    }

    setActivePage('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setActivePage]);

  const value = useMemo(
    () => ({ activePage, setActivePage, goBack, canGoBack }),
    [activePage, setActivePage, goBack, canGoBack]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

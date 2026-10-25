import { useEffect, useRef, useState } from "react";

export interface ListPage<T> {
  results: T[];
  count: number;
  next?: string | null;
}

export const CATALOG_PAGE_SIZE = 20;

export function usePagedList<T>(
  fetchPage: (offset: number, signal: AbortSignal) => Promise<ListPage<T>>,
  queryKey: string
) {
  const [items, setItems] = useState<T[]>([]);
  const [count, setCount] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [position, setPosition] = useState({ key: "", offset: 0 });
  const [revision, setRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const loader = useRef(fetchPage);
  useEffect(() => {
    loader.current = fetchPage;
  }, [fetchPage]);
  const activeKey = useRef("");
  const key = `${queryKey}:${revision}`;
  const offset = position.key === key ? position.offset : 0;

  useEffect(() => {
    const controller = new AbortController();
    const changed = activeKey.current !== key;
    const pageOffset = changed ? 0 : offset;
    activeKey.current = key;
    // Each query owns its result set; never append an obsolete response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);
    if (changed) {
      setItems([]);
      setNextOffset(null);
    }
    loader.current(pageOffset, controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return;
        setItems((current) => (pageOffset === 0 ? page.results : [...current, ...page.results]));
        setCount(page.count);
        setNextOffset(page.next && page.results.length ? pageOffset + page.results.length : null);
        setLoading(false);
      },
      () => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      }
    );
    return () => controller.abort();
  }, [key, offset, attempt]);

  return {
    items,
    setItems,
    count,
    loading,
    error,
    hasMore: nextOffset !== null,
    loadMore: () => {
      if (!loading && !error && nextOffset !== null) setPosition({ key, offset: nextOffset });
    },
    reload: () => setRevision((value) => value + 1),
    retry: () => setAttempt((value) => value + 1)
  };
}

export function useDebouncedSearch(value: string) {
  const [search, setSearch] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(value.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [value]);
  return search;
}

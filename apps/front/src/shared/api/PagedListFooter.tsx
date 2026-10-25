import { useEffect, useRef } from "react";
import { Button } from "../../components/ui";

export function PagedListFooter({
  loading,
  error,
  hasMore,
  loadMore,
  retry
}: {
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !sentinel.current ||
      loading ||
      error ||
      !hasMore ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [loading, error, hasMore, loadMore]);
  return (
    <div ref={sentinel}>
      {loading ? (
        <p role="status">در حال دریافت…</p>
      ) : error ? (
        <div role="alert">
          دریافت فهرست انجام نشد.{" "}
          <Button onClick={retry} variant="secondary">
            تلاش دوباره
          </Button>
        </div>
      ) : hasMore ? (
        <Button onClick={loadMore} variant="secondary">
          نمایش بیشتر
        </Button>
      ) : null}
    </div>
  );
}

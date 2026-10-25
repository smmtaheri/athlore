import { act, render, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePagedList, type ListPage } from "./usePagedList";
import { PagedListFooter } from "./PagedListFooter";

describe("usePagedList", () => {
  it("requests the next page when the footer scrolls into view", () => {
    let onIntersect!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          onIntersect = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      }
    );
    try {
      const loadMore = vi.fn();
      const { unmount } = render(
        <PagedListFooter
          loading={false}
          error={false}
          hasMore
          loadMore={loadMore}
          retry={vi.fn()}
        />
      );
      act(() =>
        onIntersect(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        )
      );
      expect(loadMore).toHaveBeenCalledOnce();
      unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("fetches only one page until requested and resets the offset on search", async () => {
    const fetchPage = vi.fn(async (offset: number) => ({
      results: [offset],
      count: 40,
      next: offset === 0 ? "next" : null
    }));
    const { result, rerender } = renderHook(({ search }) => usePagedList(fetchPage, search), {
      initialProps: { search: "" }
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchPage).toHaveBeenCalledTimes(1);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toEqual([0, 1]));
    rerender({ search: "squat" });
    await waitFor(() => expect(result.current.items).toEqual([0]));
    expect(fetchPage).toHaveBeenLastCalledWith(0, expect.any(AbortSignal));
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("ignores old query responses after a new search", async () => {
    let finishOld!: (page: ListPage<string>) => void;
    const old = new Promise<ListPage<string>>((resolve) => {
      finishOld = resolve;
    });
    const { result, rerender } = renderHook(
      ({ search }) =>
        usePagedList(
          () => (search ? Promise.resolve({ results: ["new"], count: 1, next: null }) : old),
          search
        ),
      { initialProps: { search: "" } }
    );
    rerender({ search: "new" });
    await waitFor(() => expect(result.current.items).toEqual(["new"]));
    await act(async () => finishOld({ results: ["old"], count: 1, next: null }));
    expect(result.current.items).toEqual(["new"]);
  });
});

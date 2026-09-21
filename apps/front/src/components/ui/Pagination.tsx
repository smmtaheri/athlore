import styles from "./ui.module.css";
import { cx } from "../../utils/classNames";

export interface PaginationProps {
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
}

type PaginationItem = number | "ellipsis";

function paginationItems(page: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", pageCount];
  }

  if (page >= pageCount - 3) {
    return [1, "ellipsis", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  }

  return [1, "ellipsis", page - 1, page, page + 1, "ellipsis", pageCount];
}

export function Pagination({ onPageChange, page, pageCount }: PaginationProps) {
  const items = paginationItems(page, pageCount);

  return (
    <nav aria-label="صفحه بندی" className={styles.pagination}>
      <button
        className={styles.paginationButton}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        قبلی
      </button>
      {items.map((item, index) =>
        item === "ellipsis" ? (
          <span aria-hidden className={styles.paginationEllipsis} key={`ellipsis-${index}`}>
            …
          </span>
        ) : (
          <button
            aria-current={item === page ? "page" : undefined}
            aria-label={`صفحه ${item}`}
            className={cx(styles.paginationButton, item === page && styles.paginationButtonActive)}
            key={item}
            onClick={() => onPageChange(item)}
            type="button"
          >
            {item}
          </button>
        )
      )}
      <button
        className={styles.paginationButton}
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        بعدی
      </button>
    </nav>
  );
}

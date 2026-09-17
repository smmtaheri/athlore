import styles from "./ui.module.css";
import { cx } from "../../utils/classNames";

export interface PaginationProps {
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
}

export function Pagination({ onPageChange, page, pageCount }: PaginationProps) {
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

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
      {pages.map((item) => (
        <button
          aria-current={item === page ? "page" : undefined}
          className={cx(styles.paginationButton, item === page && styles.paginationButtonActive)}
          key={item}
          onClick={() => onPageChange(item)}
          type="button"
        >
          {item}
        </button>
      ))}
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

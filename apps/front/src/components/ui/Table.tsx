import type { Key, ReactNode } from "react";
import styles from "./ui.module.css";
import { EmptyState } from "./EmptyState";

export interface TableColumn<TData> {
  align?: "center" | "end" | "start";
  cell: (row: TData) => ReactNode;
  header: ReactNode;
  id: string;
  width?: string;
}

export interface TableProps<TData> {
  ariaLabel: string;
  columns: Array<TableColumn<TData>>;
  data: TData[];
  emptyMessage?: string;
  getRowKey: (row: TData, index: number) => Key;
}

export function Table<TData>({
  ariaLabel,
  columns,
  data,
  emptyMessage = "موردی برای نمایش وجود ندارد.",
  getRowKey
}: TableProps<TData>) {
  if (data.length === 0) {
    return (
      <div className={styles.tableShell}>
        <EmptyState description={emptyMessage} title="لیست خالی است" />
      </div>
    );
  }

  return (
    <div className={styles.tableShell}>
      <div className={styles.tableScroll}>
        <table aria-label={ariaLabel} className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  style={{ textAlign: column.align, width: column.width }}
                  scope="col"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={getRowKey(row, index)}>
                {columns.map((column) => (
                  <td key={column.id} style={{ textAlign: column.align, width: column.width }}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.tableScrollHint}>برای دیدن ستون‌های بیشتر، جدول را افقی بکشید.</p>
    </div>
  );
}

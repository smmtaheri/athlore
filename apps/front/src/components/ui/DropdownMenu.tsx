import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { cx } from "../../utils/classNames";
import { Button } from "./Button";
import styles from "./ui.module.css";

export interface DropdownMenuItem {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
}

export interface DropdownMenuProps {
  items: DropdownMenuItem[];
  label?: string;
}

export function DropdownMenu({ items, label = "عملیات" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      return;
    }
    const update = () => {
      if (!rootRef.current) {
        return;
      }
      const rect = rootRef.current.getBoundingClientRect();
      const height = menuRef.current?.offsetHeight ?? 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < height + 16 && rect.top > height + 16;
      setMenuStyle({
        position: "fixed",
        top: openUp ? Math.max(8, rect.top - height - 8) : rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
        left: "auto",
        bottom: "auto",
        zIndex: 10000
      });
    };
    update();
    requestAnimationFrame(update);
  }, [open, items.length]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let remove: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node;
        if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
          return;
        }
        setOpen(false);
      };
      window.addEventListener("pointerdown", onPointerDown, true);
      remove = () => window.removeEventListener("pointerdown", onPointerDown, true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      remove?.();
    };
  }, [open]);

  return (
    <div className={styles.dropdown} ref={rootRef}>
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        className={styles.dropdownTrigger}
        iconStart={<MoreVertical size={18} />}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        type="button"
        variant="secondary"
      >
        {label}
      </Button>
      {open
        ? createPortal(
            <div className={styles.dropdownMenuPortal} ref={menuRef} role="menu" style={menuStyle}>
              {items.map((item) => (
                <button
                  className={cx(styles.dropdownItem)}
                  disabled={item.disabled}
                  key={item.label}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

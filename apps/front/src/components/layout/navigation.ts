import type { LucideIcon } from "lucide-react";
import { BellRing, ClipboardList, LayoutDashboard, SlidersHorizontal, Users } from "lucide-react";

export interface NavigationItem {
  end?: boolean;
  icon: LucideIcon;
  label: string;
  path: string;
}

export const primaryNavigationItems: NavigationItem[] = [
  {
    end: true,
    icon: LayoutDashboard,
    label: "داشبورد",
    path: "/dashboard"
  },
  {
    icon: Users,
    label: "شاگردها",
    path: "/students"
  },
  {
    icon: ClipboardList,
    label: "برنامه ها",
    path: "/programs"
  },
  {
    icon: BellRing,
    label: "درخواست‌های برنامه",
    path: "/program-requests"
  },
  {
    icon: SlidersHorizontal,
    label: "قوانین مربی",
    path: "/coach-rules"
  },
  {
    icon: SlidersHorizontal,
    label: "تنظیمات",
    path: "/settings"
  }
];

export function getNavigationTitle(pathname: string): string {
  if (pathname === "/program-requests" || pathname.startsWith("/program-requests/")) {
    return "درخواست‌های برنامه";
  }
  const current = primaryNavigationItems.find((item) => {
    if (item.end) {
      return pathname === item.path;
    }

    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  });

  return current?.label ?? "Athlore";
}

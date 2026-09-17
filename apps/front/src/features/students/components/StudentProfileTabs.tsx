import { useNavigate } from "react-router";
import { Tabs, type TabItem } from "../../../components/ui";
import styles from "./students.module.css";

export type StudentProfileTab = "overview" | "visits" | "programs" | "pdf-files" | "body-check";

export interface StudentProfileTabsProps {
  activeTab: StudentProfileTab;
  studentId: string;
}

const profileTabs: Array<Pick<TabItem, "id" | "label"> & { id: StudentProfileTab }> = [
  { id: "overview", label: "اطلاعات پایه" },
  { id: "visits", label: "ویزیت ها" },
  { id: "body-check", label: "بادی چک" },
  { id: "programs", label: "برنامه ها" },
  { id: "pdf-files", label: "فایل های PDF" }
];

const tabPath: Record<StudentProfileTab, (studentId: string) => string> = {
  overview: (studentId) => `/students/${studentId}`,
  visits: (studentId) => `/students/${studentId}/visits`,
  "body-check": (studentId) => `/students/${studentId}/body-check`,
  programs: (studentId) => `/students/${studentId}/programs`,
  "pdf-files": (studentId) => `/students/${studentId}/pdf-files`
};

export function StudentProfileTabs({ activeTab, studentId }: StudentProfileTabsProps) {
  const navigate = useNavigate();

  return (
    <Tabs
      ariaLabel="تب های پروفایل شاگرد"
      className={styles.profileTabs}
      items={profileTabs}
      onChange={(nextTab) => navigate(tabPath[nextTab as StudentProfileTab](studentId))}
      renderPanels={false}
      value={activeTab}
    />
  );
}

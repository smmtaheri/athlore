import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "../../components/layout";
import { ProtectedRoute, PublicOnlyRoute, StudentProtectedRoute } from "../../features/auth";
import { LoginPage, RegisterPage } from "../../features/auth/pages/AuthPages";
import { CoachRulesPage } from "../../features/coach-rules";
import { StudentBodyCheckPage } from "../../features/body-check/pages/StudentBodyCheckPage";
import { DashboardPage } from "../../features/dashboard";
import { StudentShell } from "../../features/student-portal/components/StudentShell";
import { StudentDashboardPage } from "../../features/student-portal/pages/StudentDashboardPage";
import { StudentLoginPage } from "../../features/student-portal/pages/StudentLoginPage";
import { StudentVisitDetailPage } from "../../features/student-portal/pages/StudentVisitDetailPage";
import { StudentVisitsPage } from "../../features/student-portal/pages/StudentVisitsPage";
import {
  ProgramGenerationPage,
  ProgramPreviewPage,
  ProgramsListPage
} from "../../features/programs";
import {
  StudentFormPage,
  StudentProfilePage,
  StudentVisitFormPage,
  StudentsListPage
} from "../../features/students";
import { PublicHomePage } from "../../pages/home/PublicHomePage";
import { NotFoundPage } from "../../pages/placeholders/NotFoundPage";
import { PlaceholderPage } from "../../pages/placeholders/PlaceholderPage";
import { UiKitPage } from "../../pages/ui-kit/UiKitPage";
import { resolveAppSurface } from "../config/appOrigin";
import type { AppSurface } from "../config/appOrigin";

const nextStepMessage = "پیاده سازی این صفحه در مرحله بعد انجام می شود.";

export function AppRoutes({ surface = resolveAppSurface() }: { surface?: AppSurface } = {}) {
  if (surface === "public") return <PublicRoutes />;
  if (surface === "coach") return <CoachRoutes />;
  if (surface === "student") return <StudentRoutes />;
  return (
    <Routes>
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}

function PublicRoutes() {
  return (
    <Routes>
      <Route element={<PublicHomePage />} path="/" />
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}

function CoachRoutes() {
  return (
    <Routes>
      <Route
        element={
          <PublicOnlyRoute role="coach">
            <LoginPage />
          </PublicOnlyRoute>
        }
        path="/login"
      />
      <Route
        element={
          <PublicOnlyRoute role="coach">
            <RegisterPage />
          </PublicOnlyRoute>
        }
        path="/register"
      />
      <Route
        element={
          <ProtectedRoute role="coach">
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route element={<Navigate replace to="/dashboard" />} index />
        <Route element={<DashboardPage />} path="dashboard" />
        <Route element={<StudentsListPage />} path="students" />
        <Route element={<StudentFormPage mode="create" />} path="students/new" />
        <Route element={<StudentFormPage mode="edit" />} path="students/:studentId/edit" />
        <Route element={<StudentProfilePage tab="overview" />} path="students/:studentId" />
        <Route element={<StudentProfilePage tab="visits" />} path="students/:studentId/visits" />
        <Route
          element={<StudentProfilePage tab="programs" />}
          path="students/:studentId/programs"
        />
        <Route
          element={<StudentProfilePage tab="pdf-files" />}
          path="students/:studentId/pdf-files"
        />
        <Route
          element={<StudentProfilePage tab="body-check" />}
          path="students/:studentId/body-check"
        />
        <Route
          element={<StudentVisitFormPage mode="create" />}
          path="students/:studentId/visits/new"
        />
        <Route
          element={<StudentVisitFormPage mode="edit" />}
          path="students/:studentId/visits/:visitId/edit"
        />
        <Route
          element={
            <PlaceholderPage
              breadcrumb={["داشبورد", "ویزیت ها"]}
              description={nextStepMessage}
              title="ویزیت های ماهانه"
            />
          }
          path="visits"
        />
        <Route element={<ProgramsListPage />} path="programs" />
        <Route element={<ProgramGenerationPage />} path="programs/new" />
        <Route element={<ProgramPreviewPage />} path="programs/:programId" />
        <Route element={<ProgramPreviewPage />} path="programs/:programId/preview" />
        <Route element={<CoachRulesPage />} path="coach-rules" />
        <Route
          element={
            <PlaceholderPage
              breadcrumb={["داشبورد", "تنظیمات"]}
              description={nextStepMessage}
              title="تنظیمات"
            />
          }
          path="settings"
        />
        <Route element={<UiKitPage />} path="ui-kit" />
      </Route>
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}

function StudentRoutes() {
  return (
    <Routes>
      <Route
        element={
          <PublicOnlyRoute role="student">
            <StudentLoginPage />
          </PublicOnlyRoute>
        }
        path="/login"
      />
      <Route
        element={
          <StudentProtectedRoute>
            <StudentShell />
          </StudentProtectedRoute>
        }
      >
        <Route element={<StudentDashboardPage />} path="dashboard" />
        <Route element={<StudentBodyCheckPage />} path="body-check" />
        <Route element={<StudentVisitsPage />} path="visits" />
        <Route element={<StudentVisitDetailPage />} path="visits/:visitId" />
      </Route>
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}

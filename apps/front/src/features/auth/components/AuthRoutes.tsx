import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Card, Skeleton } from "../../../components/ui";
import { NotFoundPage } from "../../../pages/placeholders/NotFoundPage";
import { useAuth } from "../context/AuthContext";

type AuthRole = "coach" | "student";

export function ProtectedRoute({ children, role }: { children: ReactNode; role: AuthRole }) {
  const { session, status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <AuthLoading />;
  }

  if (status === "anonymous") {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  if (session?.role !== role) {
    return <NotFoundPage />;
  }

  return children;
}

export function StudentProtectedRoute({ children }: { children: ReactNode }) {
  const { session, status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <AuthLoading />;
  }

  if (status === "anonymous") {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  if (session?.role !== "student") {
    return <NotFoundPage />;
  }

  if (session.mustChangePassword) {
    return <Navigate replace to="/login" />;
  }

  return children;
}

export function PublicOnlyRoute({ children, role }: { children: ReactNode; role: AuthRole }) {
  const { session, status } = useAuth();

  if (status === "loading") {
    return <AuthLoading />;
  }

  // Mid-setup student sessions stay on the student login surface for forced password change.
  if (status === "authenticated" && session?.role !== role) {
    return <NotFoundPage />;
  }

  if (status === "authenticated" && !(role === "student" && session?.mustChangePassword)) {
    return <Navigate replace to="/dashboard" />;
  }

  return children;
}

function AuthLoading() {
  return (
    <main style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
      <Card aria-label="در حال بررسی ورود" style={{ width: "min(420px, 92vw)" }}>
        <Skeleton height={72} />
      </Card>
    </main>
  );
}

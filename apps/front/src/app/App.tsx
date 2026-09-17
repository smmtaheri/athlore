import { BrowserRouter } from "react-router";
import { AuthProvider } from "../features/auth";
import { AppRoutes } from "./router/routes";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

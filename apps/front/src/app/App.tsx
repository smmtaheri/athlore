import { BrowserRouter } from "react-router";
import { AuthProvider } from "../features/auth";
import { AppRoutes } from "./router/routes";
import { CalendarProvider } from "../shared/dates/CalendarProvider";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <CalendarProvider>
          <AppRoutes />
        </CalendarProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}

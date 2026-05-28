import { Navigate, createBrowserRouter } from "react-router-dom";
import PublicMeshPage from "./pages/PublicMeshPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminConfigEditorPage from "./pages/AdminConfigEditorPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AdminLayout } from "./components/admin/AdminLayout";

export const router = createBrowserRouter([
  { path: "/", element: <PublicMeshPage /> },
  { path: "/admin/login", element: <AdminLoginPage /> },
  {
    path: "/admin",
    element: <ProtectedRoute />,
    children: [
      {
        path: "",
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: "config", element: <AdminConfigEditorPage /> },
          { path: "settings", element: <AdminSettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

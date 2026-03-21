import { createBrowserRouter, type LoaderFunctionArgs } from "react-router";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import WorkspacePage from "./pages/WorkspacePage";
import SettingsPage from "./pages/SettingsPage";
import GitHubCallbackPage from "./pages/GitHubCallbackPage";

export interface WorkspaceLoaderData {
  autoOpenBreachRoom: boolean;
}

const workspaceLoader = ({ request }: LoaderFunctionArgs): WorkspaceLoaderData => {
  const url = new URL(request.url);
  return {
    autoOpenBreachRoom: url.searchParams.get('breachroom') === 'open',
  };
};

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/auth",
    Component: AuthPage,
  },
  {
    path: "/auth/github/callback",
    Component: GitHubCallbackPage,
  },
  {
    path: "/dashboard",
    Component: DashboardPage,
  },
  {
    path: "/workspace",
    Component: WorkspacePage,
    loader: workspaceLoader,
  },
  {
    path: "/settings",
    Component: SettingsPage,
  },
]);
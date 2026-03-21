import { RouterProvider } from 'react-router';
import { router } from './routes';
import { getUser, isLoggedIn } from '../lib/auth';

export default function App() {
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const isProtectedRoute = path.startsWith('/dashboard') || path.startsWith('/workspace');
  const hasWorkspaceInvite = path.startsWith('/workspace') && searchParams.has('room');

  if (isProtectedRoute && !hasWorkspaceInvite && (!isLoggedIn() || !getUser())) {
    window.location.replace('/auth');
    return null;
  }

  return <RouterProvider router={router} />;
}

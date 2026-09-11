import { RouterProvider } from 'react-router';
import { router } from './routes';
import { getUser, isLoggedIn } from '../lib/auth';
import { Toaster } from './components/ui/sonner';

export default function App() {
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const isProtectedRoute = path.startsWith('/dashboard') || path.startsWith('/workspace');

  // An invite token is its own credential: a collaborator following a share link
  // has no session with the project owner's account, so bouncing them to /auth
  // would make live collaboration impossible.
  const hasWorkspaceInvite = path.startsWith('/workspace') && searchParams.has('invite');

  if (isProtectedRoute && !hasWorkspaceInvite && (!isLoggedIn() || !getUser())) {
    window.location.replace('/auth');
    return null;
  }

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}

import { RouterProvider } from 'react-router';
import { router } from './routes';
import { getUser, isLoggedIn } from '../lib/auth';

export default function App() {
  const path = window.location.pathname;
  const isProtectedRoute = path.startsWith('/dashboard') || path.startsWith('/workspace');

  if (isProtectedRoute && (!isLoggedIn() || !getUser())) {
    window.location.replace('/auth');
    return null;
  }

  return <RouterProvider router={router} />;
}

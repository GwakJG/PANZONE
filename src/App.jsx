import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import LoginRequiredModal from './components/LoginRequiredModal';
import SuspendedRequiredModal from './components/SuspendedRequiredModal';
import LegalPage from './pages/LegalPage';
import Home from './pages/Home';
import HotBoard from './pages/HotBoard';
import StatsTracker from './pages/StatsTracker';
import CommunitySearchResults from './pages/CommunitySearchResults';
import CommunityBoard from './pages/CommunityBoard';
import PostDetail from './pages/PostDetail';
import PostWrite from './pages/PostWrite';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import UserProfile from './pages/UserProfile';
import AdminGuard from './components/admin/AdminGuard';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminNotices from './pages/admin/AdminNotices';
import AdminNoticeWrite from './pages/admin/AdminNoticeWrite';
import AdminFeatured from './pages/admin/AdminFeatured';
import AdminNotificationSend from './pages/admin/AdminNotificationSend';
import AdminReports from './pages/admin/AdminReports';
import AdminInquiries from './pages/admin/AdminInquiries';

// Shared shell: AuthProvider + global LoginRequiredModal — wraps both
// user-facing pages and admin pages so auth state is shared.
function AppShell() {
  return (
    <AuthProvider>
      <Outlet />
      <LoginRequiredModal />
      <SuspendedRequiredModal />
    </AuthProvider>
  );
}

function UserLayout() {
  return (
    <div className="app-shell">
      <Header />
      <div className="app-main">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        element: <UserLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/community/hot', element: <HotBoard /> },
          { path: '/login', element: <Login /> },
          { path: '/signup', element: <Signup /> },
          { path: '/forgot-password', element: <ForgotPassword /> },
          { path: '/terms', element: <LegalPage docKey="legal.terms" /> },
          { path: '/privacy', element: <LegalPage docKey="legal.privacy" /> },
          { path: '/stats', element: <StatsTracker /> },
          { path: '/community/search', element: <CommunitySearchResults /> },
          { path: '/community/:boardId', element: <CommunityBoard /> },
          { path: '/community/:boardId/write', element: <PostWrite /> },
          { path: '/community/:boardId/:postId/edit', element: <PostWrite /> },
          { path: '/community/:boardId/:postId', element: <PostDetail /> },
          { path: '/user/:name', element: <UserProfile /> },
        ],
      },
      {
        path: '/admin',
        element: (
          <AdminGuard>
            <AdminLayout />
          </AdminGuard>
        ),
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: 'users', element: <AdminUsers /> },
          { path: 'notices', element: <AdminNotices /> },
          { path: 'notices/write', element: <AdminNoticeWrite /> },
          { path: 'featured', element: <AdminFeatured /> },
          { path: 'notifications', element: <AdminNotificationSend /> },
          { path: 'reports', element: <AdminReports /> },
          { path: 'inquiries', element: <AdminInquiries /> },
        ],
      },
    ],
  },
]);

function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}

export default App;

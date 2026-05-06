import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// Blocks /admin/* from non-admins. Waits for auth to resolve, then redirects
// to home if the user isn't admin/mod. Backend also enforces this — the guard
// just prevents wasted requests and flashes of unauthorized UI.
export default function AdminGuard({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (!user || (user.role !== 'admin' && user.role !== 'mod')) {
    return <Navigate to="/" replace />
  }
  return children
}

import { NavLink, Outlet, Link } from 'react-router-dom'

// Intentionally not using the user-facing Header/Footer. Admin gets its own shell.
export default function AdminLayout() {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <Link to="/" className="admin-sidebar-exit" title="일반 페이지로">
            ← PanZone
          </Link>
          <h2 className="admin-sidebar-title">관리자</h2>
        </div>
        <nav className="admin-nav">
          <NavLink to="/admin" end className="admin-nav-item">대시보드</NavLink>
          <NavLink to="/admin/users" className="admin-nav-item">유저</NavLink>
          <NavLink to="/admin/notices" className="admin-nav-item">공지글</NavLink>
          <NavLink to="/admin/featured" className="admin-nav-item">캐러셀 등록</NavLink>
          <NavLink to="/admin/notifications" className="admin-nav-item">알림 전송</NavLink>
          <NavLink to="/admin/reports" className="admin-nav-item">신고 알림</NavLink>
          <NavLink to="/admin/inquiries" className="admin-nav-item">문의 알림</NavLink>
        </nav>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}

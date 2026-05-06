import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import { useApiError } from '../../hooks/useApiError'
import { fetchAdminDashboard } from '../../services/adminApi'

// Single stat card — value + label. `tone` controls accent:
//   'attention' = primary highlight for actionable counts (pending work)
//   'default'   = neutral for informational counts
function StatCard({ label, value, hint, tone = 'default', to }) {
  const body = (
    <>
      <div className="admin-dash-card-label">{label}</div>
      <div className="admin-dash-card-value">{value}</div>
      {hint && <div className="admin-dash-card-hint">{hint}</div>}
    </>
  )
  const cls = `admin-dash-card admin-dash-card-${tone} ${to ? 'is-link' : ''}`
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>
}

function fmt(n) {
  return (n ?? 0).toLocaleString()
}

export default function AdminDashboard() {
  const showToast = useToast()
  const formatError = useApiError()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchAdminDashboard()
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) showToast(formatError(err), 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="admin-page">
        <h1 className="admin-page-title">대시보드</h1>
        <div className="admin-users-placeholder">불러오는 중...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="admin-page">
        <h1 className="admin-page-title">대시보드</h1>
        <div className="admin-users-placeholder">데이터를 불러오지 못했습니다</div>
      </div>
    )
  }

  const { today, pending, notices, carousel, suspension, totals } = data

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">대시보드</h1>
      <p className="admin-page-lead">
        오늘 상황과 내가 처리해야 할 것들을 한눈에 확인하세요.
      </p>

      <section className="admin-dash-section">
        <h2 className="admin-dash-section-title">
          오늘 <span className="admin-dash-section-hint">(매일 00시 초기화)</span>
        </h2>
        <div className="admin-dash-grid admin-dash-grid-4">
          <StatCard label="신규 가입" value={fmt(today.signups)} hint="오늘 0시부터" />
          <StatCard label="신규 글" value={fmt(today.newPosts)} hint="공지 제외" />
          <StatCard label="신규 댓글" value={fmt(today.comments)} />
          <StatCard label="활성 유저" value={fmt(today.activeUsers)} hint="오늘 접속" />
        </div>
      </section>

      <section className="admin-dash-section">
        <h2 className="admin-dash-section-title">처리 대기</h2>
        <div className="admin-dash-grid admin-dash-grid-3">
          <StatCard
            label="대기 신고"
            value={fmt(pending.reports)}
            tone={pending.reports > 0 ? 'attention' : 'default'}
            to="/admin/reports"
          />
          <StatCard
            label="대기 문의"
            value={fmt(pending.inquiries)}
            hint={pending.inquirySuspensionAppeal > 0
              ? `정지 해제 요청 ${pending.inquirySuspensionAppeal}건`
              : pending.inquiries > 0 ? '일반 문의' : null}
            tone={pending.inquiries > 0 ? 'attention' : 'default'}
            to="/admin/inquiries"
          />
          <StatCard
            label="정지 유예 중"
            value={fmt(suspension.graceCount)}
            hint={`${suspension.graceDays}일 이내 자동 파기`}
            tone={suspension.graceCount > 0 ? 'attention' : 'default'}
            to="/admin/users"
          />
        </div>
      </section>

      <section className="admin-dash-section">
        <h2 className="admin-dash-section-title">관리 스냅샷</h2>
        <div className="admin-dash-grid admin-dash-grid-4">
          <StatCard
            label="진행중 공지"
            value={fmt(notices.active)}
            to="/admin/notices"
          />
          <StatCard
            label="임시저장 공지"
            value={fmt(notices.drafts)}
            to="/admin/notices"
          />
          <StatCard
            label="캐러셀 슬롯"
            value={`${carousel.used} / ${carousel.max}`}
            hint={carousel.used === carousel.max ? '꽉 찼음 (교체 필요)' : `${carousel.max - carousel.used}개 비어있음`}
            to="/admin/featured"
          />
          <StatCard label="전체 유저" value={fmt(totals.users)} />
        </div>
      </section>

    </div>
  )
}

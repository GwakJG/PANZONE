import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Navigation, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'
import { useLanguage } from '../context/LanguageContext'
import BoardSidebar from '../components/community/BoardSidebar'
import { fetchPosts, fetchHotPosts, fetchFeaturedPosts } from '../services/postApi'

const CARD_BOARDS = ['event', 'free']
const CARD_PAGE_SIZE = 6
const CAROUSEL_INTERVAL_MS = 5000

function formatDate(iso) {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}.${dd}`
}

function applySlideProgress(swiper) {
  for (let i = 0; i < swiper.slides.length; i++) {
    const slide = swiper.slides[i]
    const progress = Math.min(Math.abs(slide.progress || 0), 1.5)
    const scale = 1 - progress * 0.25
    const opacity = 1 - progress * 0.3
    slide.style.transform = `scale(${scale})`
    slide.style.opacity = String(opacity)
  }
}

function Carousel({ items }) {
  const [prevEl, setPrevEl] = useState(null)
  const [nextEl, setNextEl] = useState(null)
  const [pagEl, setPagEl] = useState(null)
  if (!items.length) return null
  const loopable = items.length > 2

  return (
    <div className="home-carousel-frame">
      <Swiper
        className="home-carousel"
        modules={[Autoplay, Navigation, Pagination]}
        centeredSlides
        slidesPerView="auto"
        spaceBetween={-40}
        loop={loopable}
        grabCursor
        watchSlidesProgress
        onInit={applySlideProgress}
        onProgress={applySlideProgress}
        onSetTranslate={applySlideProgress}
        onSetTransition={(swiper, duration) => {
          for (let i = 0; i < swiper.slides.length; i++) {
            swiper.slides[i].style.transition = `transform ${duration}ms, opacity ${duration}ms`
          }
        }}
        navigation={{ prevEl, nextEl }}
        pagination={{ el: pagEl, clickable: true }}
        autoplay={items.length > 1 ? { delay: CAROUSEL_INTERVAL_MS, disableOnInteraction: false, pauseOnMouseEnter: true } : false}
      >
        {items.map(p => {
          const key = `${p.type || 'post'}-${p.featuredId ?? p.id}`
          const inner = (
            <>
              {p.thumbnail ? (
                <img src={p.thumbnail} alt="" className="home-carousel-image" draggable={false} />
              ) : (
                <div className="home-carousel-placeholder" />
              )}
              {p.title && (
                <div className="home-carousel-caption">
                  <h3 className="home-carousel-title">{p.title}</h3>
                </div>
              )}
            </>
          )
          if (p.type === 'banner') {
            // Banner: optional external link, fall back to plain div when no linkUrl.
            if (!p.linkUrl) {
              return (
                <SwiperSlide key={key} className="home-carousel-slide-wrap">
                  <div className="home-carousel-slide">{inner}</div>
                </SwiperSlide>
              )
            }
            // Internal only if it starts with "/" — react-router path.
            // Everything else is external; prepend https:// when protocol is missing
            // (so "www.naver.com" or "naver.com" works as the admin typed it).
            const isInternal = p.linkUrl.startsWith('/')
            const href = isInternal
              ? p.linkUrl
              : /^https?:\/\//i.test(p.linkUrl) ? p.linkUrl : `https://${p.linkUrl}`
            return (
              <SwiperSlide key={key} className="home-carousel-slide-wrap">
                {isInternal ? (
                  <Link to={href} className="home-carousel-slide" draggable={false}>
                    {inner}
                  </Link>
                ) : (
                  <a
                    href={href}
                    className="home-carousel-slide"
                    target="_blank"
                    rel="noopener noreferrer"
                    draggable={false}
                  >
                    {inner}
                  </a>
                )}
              </SwiperSlide>
            )
          }
          return (
            <SwiperSlide key={key} className="home-carousel-slide-wrap">
              <Link
                to={`/community/${p.boardSlug}/${p.id}`}
                className="home-carousel-slide"
                draggable={false}
              >
                {inner}
              </Link>
            </SwiperSlide>
          )
        })}
      </Swiper>

      <div className="home-carousel-controls">
        <button type="button" ref={setPrevEl} className="home-carousel-ctrl" aria-label="prev">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div ref={setPagEl} className="home-carousel-pagination" />
        <button type="button" ref={setNextEl} className="home-carousel-ctrl" aria-label="next">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function BoardCard({ titleKey, href, posts, loading, emptyKey }) {
  const { t } = useLanguage()
  return (
    <section className="home-card">
      <header className="home-card-header">
        <h2 className="home-card-title">{t(titleKey)}</h2>
        <Link to={href} className="home-card-more" aria-label="more">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </Link>
      </header>
      {loading ? (
        <div className="home-card-placeholder">{t('common.loading')}</div>
      ) : posts.length === 0 ? (
        <div className="home-card-placeholder">{t(emptyKey || 'common.empty')}</div>
      ) : (
        <ul className="home-card-list">
          {posts.map(p => (
            <li key={p.id}>
              <Link to={`/community/${p.boardSlug}/${p.id}`} className="home-card-item">
                <span className="home-card-item-title">{p.title}</span>
                <span className="home-card-item-meta">
                  {p.commentCount > 0 && <span>[{p.commentCount}]</span>}
                  <span>{formatDate(p.date)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function Home() {
  const [featured, setFeatured] = useState([])
  const [cards, setCards] = useState({ event: [], free: [], hot: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [featuredRes, ...boardResults] = await Promise.all([
          fetchFeaturedPosts().catch(() => ({ posts: [] })),
          ...CARD_BOARDS.map(b =>
            fetchPosts({ board: b, pageSize: CARD_PAGE_SIZE }).catch(() => ({ posts: [] }))
          ),
          fetchHotPosts({ period: 'today' }).catch(() => ({ posts: [] })),
        ])
        if (cancelled) return
        setFeatured(featuredRes.posts || [])
        setCards({
          event: boardResults[0].posts || [],
          free: boardResults[1].posts || [],
          hot: (boardResults[2].posts || []).slice(0, CARD_PAGE_SIZE),
        })
      } catch {
        // handled by per-request catch
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="community-board">
      <BoardSidebar />

      <main className="board-main">
        <Carousel items={featured} />

        <div className="home-cards">
          <BoardCard
            titleKey="community.board.event"
            href="/community/event"
            posts={cards.event}
            loading={loading}
          />
          <BoardCard
            titleKey="community.board.free"
            href="/community/free"
            posts={cards.free}
            loading={loading}
          />
          <BoardCard
            titleKey="community.sidebar.hot"
            href="/community/hot"
            posts={cards.hot}
            loading={loading}
          />
        </div>
      </main>
    </div>
  )
}

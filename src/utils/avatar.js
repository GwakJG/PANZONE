const CHICK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>
  <circle cx='20' cy='20' r='20' fill='%23fde68a'/>
  <ellipse cx='20' cy='23' rx='12' ry='11' fill='%23fbbf24'/>
  <circle cx='15.5' cy='19' r='1.6' fill='%23111827'/>
  <circle cx='24.5' cy='19' r='1.6' fill='%23111827'/>
  <path d='M17.5 23 L22.5 23 L20 26.5 Z' fill='%23f97316'/>
  <path d='M13 14 Q15 11 17 13' stroke='%23f59e0b' stroke-width='1' fill='none' stroke-linecap='round'/>
</svg>`.replace(/\s+/g, ' ').trim()

export const DEFAULT_AVATAR = `data:image/svg+xml;charset=utf-8,${CHICK_SVG}`

export function avatarOf(url) {
  return url || DEFAULT_AVATAR
}

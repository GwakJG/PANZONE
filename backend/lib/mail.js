// Email sender. Dual-mode:
//   - RESEND_API_KEY unset  → dev mode: logs to console and returns ok:true.
//     All existing local workflows keep working (the send-code endpoint still
//     exposes `devCode` in the response when DEV_EXPOSE_CODE=1).
//   - RESEND_API_KEY set    → real send via Resend. Failures are swallowed
//     (logged only) so a mail outage never blocks signup/forgot-password.
//
// Callers don't need to know which mode is active; they always await
// `sendMail({ to, subject, html, text })` and get `{ ok: boolean, ... }`.

const { Resend } = require('resend')

const apiKey = process.env.RESEND_API_KEY
const FROM = process.env.MAIL_FROM || 'PanZone <onboarding@resend.dev>'

const resend = apiKey ? new Resend(apiKey) : null

async function sendMail({ to, subject, html, text }) {
  if (!resend) {
    // Dev fallback — make the message easy to copy from the terminal.
    console.log(`\n[mail:dev] to=${to}\n[mail:dev] subject=${subject}`)
    console.log(`[mail:dev] body:\n${text || html}\n`)
    return { ok: true, dev: true }
  }
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html, text })
    if (error) {
      console.error('[mail:send]', to, subject, error.message || error)
      return { ok: false, error }
    }
    return { ok: true, id: data?.id }
  } catch (err) {
    console.error('[mail:send:exception]', to, subject, err.message)
    return { ok: false, error: err }
  }
}

module.exports = { sendMail }

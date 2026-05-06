// Email body builders. Each returns { subject, text, html } ready for sendMail.
// HTML uses inline styles so clients (naver/daum/gmail) render correctly
// without depending on external CSS.

function verificationCode({ code }) {
  return {
    subject: `[PanZone] 이메일 인증번호 ${code}`,
    text:
      `PanZone 이메일 인증\n\n` +
      `인증번호: ${code}\n` +
      `10분 이내로 입력해 주세요.\n\n` +
      `요청하지 않으셨다면 이 메일은 무시해 주세요.`,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Malgun Gothic',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111;">
  <h2 style="color:#f6ac00;margin:0 0 16px;font-size:20px;">PanZone 이메일 인증</h2>
  <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">아래 인증번호를 회원가입 화면에 입력해 주세요.</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;color:#111;font-family:monospace;">
    ${code}
  </div>
  <p style="margin:20px 0 0;color:#888;font-size:12px;line-height:1.5;">
    10분 이내로 입력해 주세요.<br>
    요청하지 않으셨다면 이 메일은 무시해 주세요.
  </p>
</div>`,
  }
}

function tempPasswordMail({ password }) {
  return {
    subject: '[PanZone] 임시 비밀번호 발급',
    text:
      `PanZone 임시 비밀번호\n\n` +
      `임시 비밀번호: ${password}\n\n` +
      `로그인 후 반드시 비밀번호를 변경해 주세요.`,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Malgun Gothic',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111;">
  <h2 style="color:#f6ac00;margin:0 0 16px;font-size:20px;">임시 비밀번호 발급</h2>
  <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">요청하신 임시 비밀번호입니다. 로그인 후 반드시 프로필에서 비밀번호를 변경해 주세요.</p>
  <div style="font-size:20px;font-weight:700;background:#f5f5f5;padding:16px;text-align:center;border-radius:8px;color:#111;font-family:monospace;word-break:break-all;">
    ${password}
  </div>
  <p style="margin:20px 0 0;color:#888;font-size:12px;line-height:1.5;">
    본인이 요청하지 않으셨다면 즉시 비밀번호를 변경하고 운영팀에 연락해 주세요.
  </p>
</div>`,
  }
}

module.exports = { verificationCode, tempPasswordMail }

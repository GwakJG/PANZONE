import { useLanguage } from '../context/LanguageContext'

const MESSAGE_MAP = {
  'Invalid email': 'errors.invalidEmail',
  'Email already registered': 'errors.emailAlreadyRegistered',
  'Email not registered': 'errors.emailNotRegistered',
  'Verification code required': 'errors.codeRequired',
  'Invalid code': 'errors.invalidCode',
  'Code expired': 'errors.codeExpired',
  'Password does not meet requirements': 'errors.invalidPassword',
  'Invalid credentials': 'errors.invalidCredentials',
  'Email and password required': 'errors.credentialsRequired',
  'Invalid nickname': 'errors.invalidNickname',
  'Nickname already taken': 'errors.nicknameTaken',
  'Nickname must be 2-16 characters': 'errors.invalidNickname',
  'Nickname must be 2-8 characters': 'errors.invalidNickname',
  'User not found': 'errors.userNotFound',
  'Unauthorized': 'common.loginRequired',
  'Invalid or expired token': 'common.loginRequired',
  'Forbidden': 'errors.forbidden',
  'Post not found': 'errors.postNotFound',
  'Comment not found': 'errors.commentNotFound',
  'Board not found': 'errors.boardNotFound',
  'Board is read-only': 'errors.boardReadOnly',
  'Title required': 'errors.titleRequired',
  'Title too long': 'errors.titleTooLong',
  'Body required': 'errors.bodyRequired',
  'Body too long': 'errors.bodyTooLong',
  'Only image files allowed': 'errors.imageOnly',
  'Unsupported image format': 'errors.imageFormat',
  'File too large': 'errors.fileTooLarge',
  'No file uploaded': 'errors.noFile',
  'Only one-level replies allowed': 'errors.onlyOneLevelReplies',
  'Already reported': 'errors.alreadyReported',
  'Reason required': 'errors.reasonRequired',
  'Internal error': 'errors.internal',
}

export function useApiError() {
  const { t } = useLanguage()
  return function format(err) {
    const msg = err?.message || ''
    const key = MESSAGE_MAP[msg]
    if (key) return t(key)
    if (!msg || msg.startsWith('HTTP ')) return t('errors.unknown')
    return msg
  }
}

export function isAuthError(err) {
  return err?.message === 'Unauthorized' || err?.message === 'Invalid or expired token'
}

// Suspended-account errors get a global modal; callers should skip toast for them.
export function isSuspendedError(err) {
  return err?.message === 'Account suspended'
}

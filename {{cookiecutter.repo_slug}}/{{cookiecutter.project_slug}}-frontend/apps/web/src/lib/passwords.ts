import { CONFIG } from '@/config/public'

// SOCIAL_LOGIN__ONLY off: a password signs in, signs up, resets and proves it is you here.
export function passwordsSignIn(): boolean {
  return !CONFIG.SOCIAL_LOGIN.ONLY
}

export const LOGIN_PATH = '/auth/login'
export const VERIFY_EMAIL_REQUIRED_PATH = '/auth/verify-email-required'

const CHANNEL_NAME = '{{ cookiecutter.project_slug }}-session'
const SESSION_CLEARED = 'session-cleared'

// One shared instance: a BroadcastChannel never delivers to its own poster, so this reaches only other tabs.
let channel: BroadcastChannel | null = null

// Guards on window, not the class: Node has BroadcastChannel too, shared across renders.
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') {
    return null
  }
  channel ??= new BroadcastChannel(CHANNEL_NAME)
  return channel
}

export function broadcastSessionCleared(): void {
  getChannel()?.postMessage(SESSION_CLEARED)
}

export function onSessionCleared(handler: () => void): () => void {
  const sessionChannel = getChannel()
  if (!sessionChannel) {
    return () => {}
  }
  const listener = (event: MessageEvent) => {
    if (event.data === SESSION_CLEARED) {
      handler()
    }
  }
  sessionChannel.addEventListener('message', listener)
  return () => sessionChannel.removeEventListener('message', listener)
}

export const LOGIN_PATH = '/auth/login'

const CHANNEL_NAME = '{{ cookiecutter.project_slug }}-session'
const SESSION_CLEARED = 'session-cleared'

// One shared instance on purpose: a BroadcastChannel never delivers a message back to the object
// that posted it, so posting and listening through the same object is exactly "tell the other
// tabs". A second instance in this tab would receive its own tab's message and hard-navigate the
// tab that is already handling the logout itself.
let channel: BroadcastChannel | null = null

// Node 18+ has a global BroadcastChannel, so this guards on window rather than the class - a
// per-process channel shared across every Server Component render is not what this is for.
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

// Callback throws jsdom reports on window, and unhandled rejections: otherwise they surface after the
// test passed, where a mutation run cannot count them as a kill.
export function collectUncaught() {
  const caught: unknown[] = []
  const onError = (event: ErrorEvent) => {
    event.preventDefault()
    caught.push(event.error)
  }
  const onRejection = (reason: unknown) => caught.push(reason)
  window.addEventListener('error', onError)
  process.on('unhandledRejection', onRejection)
  return {
    async stop() {
      // A macrotask, because Node declares a rejection unhandled only once the microtask queue drains.
      await new Promise((resolve) => setTimeout(resolve, 0))
      window.removeEventListener('error', onError)
      process.off('unhandledRejection', onRejection)
      return caught
    },
  }
}

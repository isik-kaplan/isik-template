// What escaped the code under test: a throw inside an event or observer callback, which jsdom reports on
// window instead of throwing, and a rejection nothing handled. Uncollected, either one surfaces only after
// the test has passed, as an error outside any test - which a mutation run cannot count as a kill.
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

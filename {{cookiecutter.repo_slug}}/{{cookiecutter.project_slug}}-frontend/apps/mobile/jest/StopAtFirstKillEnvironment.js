const PresetEnvironment = require(require('jest-expo/jest-preset').testEnvironment)

// Stryker names the mutant under test here for the whole of that mutant's run, and nowhere else.
const ACTIVE_MUTANT = '__STRYKER_ACTIVE_MUTANT__'
// Module state, so it outlives each test file: Stryker runs a mutant's files in band, one process.
let killedMutant

// Stryker turns jest's bail off, so a mutant blanking a shared component ran every screen test after
// the first kill, each waiting out a findBy timeout, until Stryker's own timeout counted it alive.
class StopAtFirstKillEnvironment extends PresetEnvironment {
  async handleTestEvent(event, state) {
    await super.handleTestEvent?.(event, state)
    const mutant = process.env[ACTIVE_MUTANT]
    if (mutant === undefined) return
    if (event.name === 'test_done' && event.test.errors.length > 0) killedMutant = mutant
    if (event.name === 'test_start' && killedMutant === mutant) event.test.mode = 'skip'
  }
}

module.exports = StopAtFirstKillEnvironment

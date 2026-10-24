const PresetEnvironment = require(require('jest-expo/jest-preset').testEnvironment)

const ACTIVE_MUTANT = '__STRYKER_ACTIVE_MUTANT__'
// Module state outlives each test file: Stryker runs a mutant's files in band.
let killedMutant

// Stryker turns jest's bail off, so a mutant could otherwise outlast its timeout after the first kill.
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

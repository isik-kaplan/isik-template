const Sequencer = require('@jest/test-sequencer').default
const { statSync } = require('fs')

// The narrowest test files first, by size then path, whatever the last run's cache says: a mutant dies
// fastest to its own file's unit test, and StopAtFirstKillEnvironment skips its tests after that.
class NarrowestFirstSequencer extends Sequencer {
  sort(tests) {
    const size = (test) => statSync(test.path).size
    return [...tests].sort((a, b) => size(a) - size(b) || a.path.localeCompare(b.path))
  }
}

module.exports = NarrowestFirstSequencer

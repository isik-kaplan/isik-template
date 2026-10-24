const Sequencer = require('@jest/test-sequencer').default
const { statSync } = require('fs')

// Smallest files first, ignoring the cache: a mutant dies fastest to its own file's unit test.
class NarrowestFirstSequencer extends Sequencer {
  sort(tests) {
    const size = (test) => statSync(test.path).size
    return [...tests].sort((a, b) => size(a) - size(b) || a.path.localeCompare(b.path))
  }
}

module.exports = NarrowestFirstSequencer

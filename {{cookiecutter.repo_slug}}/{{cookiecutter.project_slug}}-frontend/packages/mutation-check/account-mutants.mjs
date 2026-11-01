import { ALIVE, fingerprint } from './judge-mutants.mjs'
import { calculateMetrics } from 'mutation-testing-metrics'

/**
 * The report with every exempt survivor restated as `Ignored`, the one status Stryker's score leaves
 * out. Matched as judgeMutants matches them, so the score printed and the gate agree on what is excused.
 */
export function accountFor(report, catalog) {
  let ignored = 0
  const files = Object.fromEntries(
    Object.entries(report.files).map(([file, data]) => {
      const excused = new Set((catalog[file] ?? []).map((entry) => `${entry.mutator}:${entry.fingerprint}`))
      const lines = data.source.split('\n')
      const mutants = data.mutants.map((mutant) => {
        if (!ALIVE.has(mutant.status)) return mutant
        if (!excused.has(`${mutant.mutatorName}:${fingerprint(lines, mutant.location)}`)) return mutant
        ignored++
        return { ...mutant, status: 'Ignored', statusReason: 'Exempt in mutation-exemptions.json' }
      })
      return [file, { ...data, mutants }]
    })
  )
  return { files, ignored }
}

export function summarize(report, catalog) {
  const { files, ignored } = accountFor(report, catalog)
  const { metrics } = calculateMetrics(files)
  const total = metrics.totalMutants
  // A run narrowed to one file can leave nothing to divide by.
  const share = total === 0 ? 0 : (ignored / total) * 100
  return {
    score: metrics.mutationScore,
    detected: metrics.totalDetected,
    valid: metrics.totalValid,
    ignored,
    total,
    share,
  }
}

export function lines({ score, detected, valid, ignored, total, share }) {
  return [
    `Mutation score, exemptions excluded: ${score.toFixed(2)}`,
    `  ${detected} of ${valid} mutants a test is expected to kill`,
    `  ${ignored} exempt (${share.toFixed(2)}% of ${total})`,
  ]
}

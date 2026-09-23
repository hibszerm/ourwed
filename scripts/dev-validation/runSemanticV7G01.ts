import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HarnessFailure, runSemanticV7G01Harness } from './semanticV7G01Harness'

export async function main(args = process.argv.slice(2)) {
  try {
    const result = await runSemanticV7G01Harness(args, { repositoryRoot: process.cwd() })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return result
  } catch (error) {
    const code = error instanceof HarnessFailure ? error.code : 'HARNESS_FAILURE'
    process.stderr.write(`Semantic V7 G01 validation stopped: ${code}\n`)
    process.stderr.write('Dry run: --golden G01. Paid live call: --golden G01 --live --confirm-paid-g01-one-call\n')
    process.exitCode = 1
    return null
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}

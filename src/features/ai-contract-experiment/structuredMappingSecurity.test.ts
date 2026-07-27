/**
 * Security assertions — no OpenAI secrets in frontend bundle.
 * Run: npm run test:ai-contract-mapping-security
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(js|css|html)$/i.test(name)) out.push(p)
  }
  return out
}

async function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok — ${name}`)
  } catch (e) {
    console.error(`FAIL — ${name}`)
    throw e
  }
}

async function main() {
  const srcRoot = resolve(process.cwd(), 'src/features/ai-contract-experiment')
  const apiClient = readFileSync(
    resolve(srcRoot, 'structuredMappingApi.ts'),
    'utf8',
  )

  await run('frontend API client does not import openai package', () => {
    assert(!apiClient.includes("from 'openai'"), 'no openai import')
    assert(!apiClient.includes('OPENAI_API_KEY'), 'no key reference')
  })

  await run('frontend API calls only supabase edge function', () => {
    assert(
      apiClient.includes('ai-contract-lab-structured-mapping'),
      'edge function name',
    )
    assert(apiClient.includes('supabase.functions.invoke'), 'edge invoke')
    assert(
      !apiClient.includes('api.openai.com'),
      'no direct OpenAI URL',
    )
  })

  await run('experiment module does not import production transform', () => {
    const transform = readFileSync(
      resolve(
        process.cwd(),
        'src/features/documents/template/ContractTransformationService.ts',
      ),
      'utf8',
    )
    assert(
      !transform.includes('ai-contract-experiment'),
      'prod transform isolated',
    )
  })

  const dist = resolve(process.cwd(), 'dist')
  let distFiles: string[] = []
  try {
    distFiles = walk(dist)
  } catch {
    console.log('skip — dist/ not built yet; run npm run build first')
    return
  }

  if (distFiles.length) {
    await run('built assets do not contain OPENAI_API_KEY', () => {
      for (const file of distFiles) {
        const content = readFileSync(file, 'utf8')
        assert(
          !content.includes('OPENAI_API_KEY'),
          `secret marker in ${file}`,
        )
      }
    })

    await run('built assets do not contain sk- key pattern', () => {
      for (const file of distFiles) {
        const content = readFileSync(file, 'utf8')
        assert(!/sk-[a-zA-Z0-9]{20,}/.test(content), `sk- pattern in ${file}`)
      }
    })
  }

  console.log('\nSecurity assertions passed.')
}

main().catch(() => process.exit(1))

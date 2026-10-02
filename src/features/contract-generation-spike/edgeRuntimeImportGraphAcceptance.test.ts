import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const functionEntry = 'supabase/functions/contract-generation-boundary/index.ts'
let repositoryRoot = path.dirname(fileURLToPath(import.meta.url))
while (!existsSync(path.join(repositoryRoot, functionEntry))) {
  const parent = path.dirname(repositoryRoot)
  assert.notEqual(parent, repositoryRoot, `Could not locate ${functionEntry}`)
  repositoryRoot = parent
}

type LocalImport = { from: string; specifier: string; target: string | null }
const visited = new Set<string>()
const localRuntimeImports: LocalImport[] = []
const extensionlessImports: LocalImport[] = []
const unresolvedImports: LocalImport[] = []

function resolveLocalImport(importer: string, specifier: string): string | null {
  let target: string
  if (specifier.startsWith('@/')) {
    target = path.join(repositoryRoot, 'src', specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    target = path.resolve(path.dirname(importer), specifier)
  } else {
    return null
  }

  const candidates = path.extname(target)
    ? [target]
    : [target, `${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}.jsx`,
      path.join(target, 'index.ts'), path.join(target, 'index.tsx'), path.join(target, 'index.js')]
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

function isTypeOnlyImport(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return false
  if (clause.isTypeOnly || clause.name) return clause.isTypeOnly
  if (!clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) return false
  return clause.namedBindings.elements.length > 0
    && clause.namedBindings.elements.every((element) => element.isTypeOnly)
}

function visitModule(importer: string): void {
  importer = path.resolve(importer)
  if (visited.has(importer)) return
  visited.add(importer)

  const source = readFileSync(importer, 'utf8')
  const sourceFile = ts.createSourceFile(importer, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  function visitImport(specifier: string, typeOnly: boolean): void {
    if (typeOnly) return
    const target = resolveLocalImport(importer, specifier)
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return

    const entry = { from: path.relative(repositoryRoot, importer), specifier, target: target && path.relative(repositoryRoot, target) }
    localRuntimeImports.push(entry)
    if (!path.extname(specifier)) extensionlessImports.push(entry)
    if (!target) {
      unresolvedImports.push(entry)
      return
    }
    visitModule(target)
  }

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      visitImport(statement.moduleSpecifier.text, isTypeOnlyImport(statement.importClause))
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      visitImport(statement.moduleSpecifier.text, statement.isTypeOnly)
    }
  }

  function visitDynamicImports(node: ts.Node): void {
    if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])) {
      visitImport(node.arguments[0].text, false)
    }
    ts.forEachChild(node, visitDynamicImports)
  }
  visitDynamicImports(sourceFile)
}

visitModule(path.join(repositoryRoot, functionEntry))

assert.ok(localRuntimeImports.length > 0, 'Expected to find local runtime imports in the Edge Function graph')
assert.deepEqual(unresolvedImports, [], `Unresolved Edge Function imports: ${JSON.stringify(unresolvedImports, null, 2)}`)
assert.deepEqual(extensionlessImports, [], `Edge Function imports must name actual files explicitly: ${JSON.stringify(extensionlessImports, null, 2)}`)

console.log(`PASS ${localRuntimeImports.length} Edge-reachable local runtime imports resolve explicitly across ${visited.size} modules`)

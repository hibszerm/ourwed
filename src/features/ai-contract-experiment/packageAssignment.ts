/**
 * Package assignment enforcement for experiment runs.
 */

export function assertWeddingMatchesExperimentPackage(input: {
  weddingPackageId: string | null | undefined
  experimentPackageId: string
}): { ok: true } | { ok: false; message: string } {
  const weddingPkg = input.weddingPackageId?.trim() || null
  const experimentPkg = input.experimentPackageId.trim()
  if (!experimentPkg) {
    return {
      ok: false,
      message: 'Szablon eksperymentalny musi być przypisany do pakietu.',
    }
  }
  if (!weddingPkg) {
    return {
      ok: false,
      message: 'Wybrany ślub nie ma przypisanego pakietu.',
    }
  }
  if (weddingPkg !== experimentPkg) {
    return {
      ok: false,
      message:
        'Wybrany ślub korzysta z innego pakietu niż umowa testowa.',
    }
  }
  return { ok: true }
}

/** Pure helpers for list-level package item menu exclusivity. */

export function nextOpenPackageItemId(
  currentOpenId: string | null,
  itemId: string,
  open: boolean,
): string | null {
  if (!open) return currentOpenId === itemId ? null : currentOpenId
  return itemId
}

export function sanitizeOpenPackageItemId(
  openItemId: string | null,
  itemIds: readonly string[],
): string | null {
  if (openItemId == null) return null
  return itemIds.includes(openItemId) ? openItemId : null
}

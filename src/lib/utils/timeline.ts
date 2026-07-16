import type { WeddingTimelineEntry, WeddingTimelineEntryType } from '@/types/wedding'

export interface CreateTimelineEntryInput {
  title: string
  type: WeddingTimelineEntryType
  description?: string
  date?: string
  id?: string
}

/** Creates a timeline entry with today's date (or provided). */
export function createTimelineEntry(
  input: CreateTimelineEntryInput,
): WeddingTimelineEntry {
  return {
    id: input.id ?? `tl-${Date.now()}`,
    title: input.title,
    date: input.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    description: input.description,
    type: input.type,
  }
}

/** Prepend a timeline entry (newest-first store order). */
export function prependTimelineEntry(
  entries: WeddingTimelineEntry[],
  entry: WeddingTimelineEntry | null,
): WeddingTimelineEntry[] {
  if (!entry) return entries
  return [entry, ...entries]
}

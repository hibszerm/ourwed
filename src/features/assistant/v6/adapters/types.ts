export type ConceptScalarValue = string | number | boolean | null

export type ConceptInspectValue = {
  value: ConceptScalarValue | Record<string, unknown> | null
  filled: boolean
  valueType: string
  displayText?: string | null
}

export type RelatedListItem = {
  title: string
  subtitle?: string | null
  meta?: string | null
}

export type RelatedListResult = {
  items: RelatedListItem[]
  totalCount: number
  truncated: boolean
  relationKey: string
}

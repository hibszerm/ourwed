/** Phase-1 canonical shared Wedding Detail projection. Keep this DTO identity-only. */
export interface CollaborativeWeddingIdentity {
  wedding_id: string
  couple_first_name: string
  couple_second_name: string
  wedding_date: string | null
}

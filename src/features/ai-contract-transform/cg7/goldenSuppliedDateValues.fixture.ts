/**
 * Evaluation-only simulated user entries for the accepted six-Golden replay.
 * Never import this fixture from production generation or UI code.
 */
export const GOLDEN_SUPPLIED_DATE_VALUES = [
  { goldenId: 'G02', sourceBlockId: 'table-2-row-3-cell-1-p-0', role: 'final_payment_due_date', sourceAnchor: 'do 14 sierpnia 2027', value: '2027-10-02' },
  { goldenId: 'G04', sourceBlockId: 'table-4-row-1-cell-3-p-0', role: 'brief_due_date', sourceAnchor: '02.09.2027', value: '2027-10-10' },
  { goldenId: 'G04', sourceBlockId: 'table-4-row-2-cell-3-p-0', role: 'schedule_confirmation_date', sourceAnchor: '22.09.2027', value: '2027-11-03' },
  { goldenId: 'G04', sourceBlockId: 'table-4-row-4-cell-3-p-0', role: 'other_contractual_date', sourceAnchor: '01.12.2027', value: '2027-12-15' },
  { goldenId: 'G04', sourceBlockId: 'table-4-row-5-cell-3-p-0', role: 'album_due_date', sourceAnchor: '22.12.2027', value: '2027-12-20' },
  { goldenId: 'G04', sourceBlockId: 'table-4-row-6-cell-3-p-0', role: 'delivery_due_date', sourceAnchor: '19.01.2028', value: '2028-01-25' },
  { goldenId: 'G04', sourceBlockId: 'table-5-row-4-cell-1-p-0', role: 'final_payment_due_date', sourceAnchor: '25.09.2027', value: '2027-11-06' },
  { goldenId: 'G06', sourceBlockId: 'table-1-row-2-cell-1-p-0', role: 'final_payment_due_date', sourceAnchor: '20 listopada 2027', value: '2027-11-27' },
] as const

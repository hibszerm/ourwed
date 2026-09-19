/**
 * V6-SV2 — Small counterfactual fixtures (semantic ≡ vs accidental equality).
 * Benchmark-only. No property framework.
 */

export type Sv2WeddingRow = {
  id: string
  place: string
  year: number
  dateOrd: number
  contract_value: number
  remaining_amount: number
}

export type Sv2Counterfactual = {
  id: string
  relatedCaseIds: string[]
  purpose: string
  datasets: Array<{ name: string; rows: Sv2WeddingRow[] }>
  /** Apply plan effect on rows → ordered id list or aggregate number */
  applyFaithful: (rows: Sv2WeddingRow[]) => string[] | number
  applyDraftLike: (rows: Sv2WeddingRow[]) => string[] | number
  expectSameOnBase?: boolean
  expectDifferOnCounterfactual: boolean
}

const baseTop3: Sv2WeddingRow[] = [
  { id: 'a', place: 'X', year: 2027, dateOrd: 1, contract_value: 30, remaining_amount: 5 },
  { id: 'b', place: 'Y', year: 2027, dateOrd: 2, contract_value: 20, remaining_amount: 4 },
  { id: 'c', place: 'Z', year: 2027, dateOrd: 3, contract_value: 10, remaining_amount: 3 },
  { id: 'd', place: 'W', year: 2027, dateOrd: 4, contract_value: 5, remaining_amount: 2 },
]

function topNByContract(rows: Sv2WeddingRow[], n: number) {
  return [...rows]
    .sort((x, y) => y.contract_value - x.contract_value || x.id.localeCompare(y.id))
    .slice(0, n)
    .map((r) => r.id)
}

function nearestN(rows: Sv2WeddingRow[], n: number, exclude?: string) {
  return [...rows]
    .filter((r) => (exclude ? !r.place.includes(exclude) : true))
    .sort((x, y) => x.dateOrd - y.dateOrd || x.id.localeCompare(y.id))
    .slice(0, n)
    .map((r) => r.id)
}

export const SV2_COUNTERFACTUALS: Sv2Counterfactual[] = [
  {
    id: 'cf-top3-shuffle',
    relatedCaseIds: ['sv2-h21', 'sv1-eq-top3-sort-slice', 'sv1-pb21-x12'],
    purpose: 'SORT+SLICE top-3 stable under shuffle (tie-break by id).',
    datasets: [
      { name: 'base', rows: baseTop3 },
      {
        name: 'shuffled',
        rows: [baseTop3[2]!, baseTop3[0]!, baseTop3[3]!, baseTop3[1]!],
      },
      {
        name: 'tied_values',
        rows: [
          { id: 'a', place: 'X', year: 2027, dateOrd: 1, contract_value: 30, remaining_amount: 1 },
          { id: 'b', place: 'Y', year: 2027, dateOrd: 2, contract_value: 30, remaining_amount: 1 },
          { id: 'c', place: 'Z', year: 2027, dateOrd: 3, contract_value: 30, remaining_amount: 1 },
          { id: 'd', place: 'W', year: 2027, dateOrd: 4, contract_value: 10, remaining_amount: 1 },
        ],
      },
    ],
    applyFaithful: (rows) => topNByContract(rows, 3),
    applyDraftLike: (rows) => topNByContract(rows, 3),
    expectSameOnBase: true,
    expectDifferOnCounterfactual: false,
  },
  {
    id: 'cf-exclude-vs-include',
    relatedCaseIds: ['sv2-h06'],
    purpose: 'Include-filter ≠ exclude under changed place distribution.',
    datasets: [
      {
        name: 'base_one_folwark',
        rows: [
          { id: '1', place: 'Folwark Stara Wieś', year: 2027, dateOrd: 1, contract_value: 1, remaining_amount: 1 },
          { id: '2', place: 'Inne', year: 2027, dateOrd: 2, contract_value: 1, remaining_amount: 1 },
          { id: '3', place: 'Inne2', year: 2027, dateOrd: 3, contract_value: 1, remaining_amount: 1 },
        ],
      },
      {
        name: 'extra_non_folwark',
        rows: [
          { id: '1', place: 'Folwark Stara Wieś', year: 2027, dateOrd: 1, contract_value: 1, remaining_amount: 1 },
          { id: '2', place: 'Inne', year: 2027, dateOrd: 2, contract_value: 1, remaining_amount: 1 },
          { id: '3', place: 'Inne2', year: 2027, dateOrd: 3, contract_value: 1, remaining_amount: 1 },
          { id: '4', place: 'Inne3', year: 2027, dateOrd: 4, contract_value: 1, remaining_amount: 1 },
        ],
      },
    ],
    applyFaithful: (rows) => nearestN(rows, 2, 'Folwark Stara Wieś'),
    applyDraftLike: (rows) =>
      nearestN(
        rows.filter((r) => r.place.includes('Folwark Stara Wieś')),
        2,
      ),
    expectSameOnBase: false,
    expectDifferOnCounterfactual: true,
  },
  {
    id: 'cf-drop-year',
    relatedCaseIds: ['sv2-h28'],
    purpose: 'Dropped year differs when year distribution changes.',
    datasets: [
      {
        name: 'all_2026',
        rows: [
          { id: 'a', place: 'Stodola Pod Lipą', year: 2026, dateOrd: 1, contract_value: 1, remaining_amount: 1 },
          { id: 'b', place: 'Stodola Pod Lipą', year: 2026, dateOrd: 2, contract_value: 1, remaining_amount: 1 },
          { id: 'c', place: 'Stodola Pod Lipą', year: 2026, dateOrd: 3, contract_value: 1, remaining_amount: 1 },
        ],
      },
      {
        name: 'mixed_years',
        rows: [
          { id: 'a', place: 'Stodola Pod Lipą', year: 2025, dateOrd: 1, contract_value: 1, remaining_amount: 1 },
          { id: 'b', place: 'Stodola Pod Lipą', year: 2026, dateOrd: 2, contract_value: 1, remaining_amount: 1 },
          { id: 'c', place: 'Stodola Pod Lipą', year: 2027, dateOrd: 3, contract_value: 1, remaining_amount: 1 },
          { id: 'd', place: 'Stodola Pod Lipą', year: 2026, dateOrd: 4, contract_value: 1, remaining_amount: 1 },
        ],
      },
    ],
    applyFaithful: (rows) =>
      nearestN(
        rows.filter((r) => r.year === 2026 && r.place.includes('Stodola')),
        3,
      ),
    applyDraftLike: (rows) =>
      nearestN(
        rows.filter((r) => r.place.includes('Stodola')),
        3,
      ),
    expectSameOnBase: true,
    expectDifferOnCounterfactual: true,
  },
  {
    id: 'cf-drop-exclude',
    relatedCaseIds: ['sv2-h29'],
    purpose: 'Dropped exclude equals nearest-5 only until Folwark appears early.',
    datasets: [
      {
        name: 'folwark_late',
        rows: [
          { id: '1', place: 'A', year: 2027, dateOrd: 1, contract_value: 1, remaining_amount: 1 },
          { id: '2', place: 'B', year: 2027, dateOrd: 2, contract_value: 1, remaining_amount: 1 },
          { id: '3', place: 'C', year: 2027, dateOrd: 3, contract_value: 1, remaining_amount: 1 },
          { id: '4', place: 'D', year: 2027, dateOrd: 4, contract_value: 1, remaining_amount: 1 },
          { id: '5', place: 'E', year: 2027, dateOrd: 5, contract_value: 1, remaining_amount: 1 },
          { id: '6', place: 'Folwark Stara Wieś', year: 2027, dateOrd: 6, contract_value: 1, remaining_amount: 1 },
        ],
      },
      {
        name: 'folwark_early',
        rows: [
          { id: '1', place: 'Folwark Stara Wieś', year: 2027, dateOrd: 1, contract_value: 1, remaining_amount: 1 },
          { id: '2', place: 'B', year: 2027, dateOrd: 2, contract_value: 1, remaining_amount: 1 },
          { id: '3', place: 'C', year: 2027, dateOrd: 3, contract_value: 1, remaining_amount: 1 },
          { id: '4', place: 'D', year: 2027, dateOrd: 4, contract_value: 1, remaining_amount: 1 },
          { id: '5', place: 'E', year: 2027, dateOrd: 5, contract_value: 1, remaining_amount: 1 },
          { id: '6', place: 'F', year: 2027, dateOrd: 6, contract_value: 1, remaining_amount: 1 },
        ],
      },
    ],
    applyFaithful: (rows) => nearestN(rows, 5, 'Folwark Stara Wieś'),
    applyDraftLike: (rows) => nearestN(rows, 5),
    expectSameOnBase: true,
    expectDifferOnCounterfactual: true,
  },
  {
    id: 'cf-root-vs-refine',
    relatedCaseIds: ['sv2-h08'],
    purpose: 'Root rematerialization ≠ exact prior subset when membership differs.',
    datasets: [
      {
        name: 'prior_snapshot',
        rows: [
          { id: 'p1', place: 'Hotel Belweder', year: 2027, dateOrd: 10, contract_value: 1, remaining_amount: 1 },
          { id: 'p2', place: 'Inne', year: 2027, dateOrd: 11, contract_value: 1, remaining_amount: 1 },
          { id: 'p3', place: 'Hotel Belweder', year: 2027, dateOrd: 12, contract_value: 1, remaining_amount: 1 },
          { id: 'p4', place: 'X', year: 2027, dateOrd: 13, contract_value: 1, remaining_amount: 1 },
          { id: 'p5', place: 'Y', year: 2027, dateOrd: 14, contract_value: 1, remaining_amount: 1 },
          { id: 'p6', place: 'Z', year: 2027, dateOrd: 15, contract_value: 1, remaining_amount: 1 },
          {
            id: 'early_belweder_not_in_prior',
            place: 'Hotel Belweder',
            year: 2027,
            dateOrd: 1,
            contract_value: 1,
            remaining_amount: 1,
          },
        ],
      },
    ],
    applyFaithful: (rows) => {
      const prior = nearestN(rows.filter((r) => r.id.startsWith('p')), 6)
      return prior.filter((id) => rows.find((r) => r.id === id)!.place.includes('Belweder'))
    },
    applyDraftLike: (rows) =>
      nearestN(
        rows.filter((r) => r.place.includes('Belweder')),
        6,
      ),
    expectSameOnBase: false,
    expectDifferOnCounterfactual: true,
  },
]

export function runSv2Counterfactuals() {
  return SV2_COUNTERFACTUALS.map((cf) => {
    const perDataset = cf.datasets.map((ds) => {
      const faithful = cf.applyFaithful(ds.rows)
      const draft = cf.applyDraftLike(ds.rows)
      const same = JSON.stringify(faithful) === JSON.stringify(draft)
      return { name: ds.name, faithful, draft, same }
    })
    const differsSomewhere = perDataset.some((d) => !d.same)
    return {
      id: cf.id,
      relatedCaseIds: cf.relatedCaseIds,
      purpose: cf.purpose,
      perDataset,
      differsSomewhere,
      pass: cf.expectDifferOnCounterfactual ? differsSomewhere : !differsSomewhere,
    }
  })
}

# V3 Compensation financial trace

Baseline: `d3e3093a59e80b5d42ce0b62fadd285d7dfbeebd`.

## Actor-centric values

- Finance season rows are assembled by `financeSeasonService.loadSeason` and `buildWeddingAssignment` in `src/lib/api/financeSeasonService.ts` and `src/lib/finance/financeSeasonAggregate.ts`. They now join `get_my_personal_compensation_values_v3` and keep separate `contractValue` and actor-specific `personalValue` fields.
- Actor-centric surfaces updated: Finance assignment rows; known-value aggregate and average; selected month buckets/chart; season KPI strip; summary rail; owner and collaborator Finance list rows/cards; collaborative post-revoke archive entry. Unknown values remain excluded from known sums/averages and are visibly counted as unknown.
- Owner job value is returned by the canonical RPC as contract value minus all active official allocations. Collaborator job value is official terms when visible, otherwise their own private fallback, otherwise unknown. Collaborative assignment rows carry no client contract value and no client paid/remaining totals.
- Client deposit is retained as its own clearly labelled contract-payment metric for owned assignments; it is not part of personal earnings. Collaborative rows do not display the owner payment ledger.
- No existing Dashboard V3 earnings or personal-revenue aggregate was found in `src/features/dashboard*`; dashboard finance signals describe payment state/deposit health. `weddingMetrics`, calendar values, and Assistant finance query aggregates are contract-value/client-ledger metrics, not user earnings, and remain contract-centric.

## Contract/customer value — retain full `weddings.contract_value`

- `paymentService` CRUD and payment rows are the client-payment ledger. `payment_date IS NOT NULL` is the paid state. Amount, type, date, method, and note are contract/customer accounting and remain unchanged by compensation.
- Wedding detail finance (`WeddingDetailFinances`, `ModernWeddingContractFinanceWorkspace`, `FinanceFields`) calculates client paid/remaining against the complete contract value and must continue doing so.
- Payment schedule, wedding creation/deposit handling, contract generation, commercial calculations, package/extras/travel invariants, and wedding detail customer totals remain based on full `contract_value` / `wedding.price` semantics.
- Session finance remains independently based on session `total_price` and `session_payments`.

## Payment paths traced

- Create: `paymentService.create`, called by wedding deposit creation, Wedding Detail add-payment modal, and the edit-draft persistence path.
- Edit/mark paid/unpaid: `paymentService.update`, called by add-payment edit, modern Wedding Detail finance workspace, compact Wedding Detail finance fields, and persisted edit-draft changes. Paid is represented by non-null `payment_date`.
- Delete: `paymentService.delete`, called by wedding edit-draft removal and modern Wedding Detail workspace.
- Finance load: `financeSeasonService.loadSeason` fetches owner weddings, then `paymentService.listByWeddingIds`, then builds mixed wedding/session aggregates.

## Classification rule

Every future use must declare whether it is a client contract value (full contract) or actor personal economic value (owner net of official allocations; collaborator visible official allocation, else private fallback, else unknown). Compensation never mutates contract value or payment amounts.

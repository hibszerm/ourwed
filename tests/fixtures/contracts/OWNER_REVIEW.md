# CG1 Owner review artifacts

## Recovery

`086ac1626731ec42ce5210b49b5c636e1ca802e1`

## Deterministic outputs (local after suite run)

Under `tmp/cg1-artifacts/deterministic/` (gitignored):

- `MATRIX.json` — full result matrix
- `T01_BASE.docx` … `T10_EXTRAS.docx` — generated DOCX
- `*.snapshot.json` — structural snapshots

Regenerate:

```bash
npm run test:cg1-contract-torture
```

## Fixtures (committed)

`tests/fixtures/contracts/templates/T01_*.docx` … `T10_*.docx`

## Paid eval

Not auto-run. Requires explicit `CG1_PAID_EVAL=1` + `OPENAI_API_KEY`.
Does not pollute CRM.

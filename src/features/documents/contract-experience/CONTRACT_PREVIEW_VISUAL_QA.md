# Contract preview visual QA notes

Fixture intent (manual): a multi-page Polish wedding contract DOCX with:

- headers / footers
- a payment table
- page breaks
- Polish diacritics (ąęćłńóśźż)
- payment schedule (zadatek + II/III rata)

## Observed rendering differences (not pixel-identical)

| Surface | Notes |
| --- | --- |
| Microsoft Word | Authoritative layout for legal download |
| `docx-preview` (browser) | Close layout; fonts/spacing/page breaks can differ slightly; headers/footers approximate |
| Production PDF (`contract-docx-to-pdf` → Cloudmersive) | Layout/fonts may differ from Word; downloadable DOCX remains canonical |

Do **not** claim identical Word output for either browser preview or production PDF.
The downloadable DOCX remains the exact final write-back artifact.

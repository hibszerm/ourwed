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
| Gotenberg / LibreOffice PDF | Optional experimental; line breaks, pagination, and font substitution may differ from Word |

Do **not** claim identical Word output for either browser preview or LibreOffice PDF.
The downloadable DOCX remains the exact final write-back artifact.

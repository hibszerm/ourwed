# Future Architecture

## Decouple CRM data from Form Engine answers

Current state

The CRM reads and updates some wedding information directly from

form_answers.answer_json.

This works, but Form Engine responses should not be the long-term source of truth.

Target architecture

- Form Engine stores only submitted questionnaire history.

- Approving a questionnaire copies all contract data into dedicated CRM tables.

- Wedding Detail edits only CRM tables.

- Questionnaire answers remain immutable historical data.

- Regenerating questionnaires never overwrites CRM data.

- Contracts, invoices and exports read CRM tables only.

Potential tables

- wedding_contract_data

or

- wedding_people

Priority

Low

Implement after the production MVP is stable.
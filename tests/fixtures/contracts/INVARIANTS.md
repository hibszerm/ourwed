# CG1 Contract Generation Invariants

Recovery point: `086ac1626731ec42ce5210b49b5c636e1ca802e1`

I1. Unmodified legal content that does not require change must survive.
I2. Existing template structure must be preserved as much as possible.
I3. Mapped/dataset fields must contain correct CRM/questionnaire values.
I4. No synthetic facts may be invented by the generator.
I5. No service may appear twice accidentally.
I6. No party/signatory may appear twice accidentally.
I7. No expected party may disappear.
I8. When no extras exist, generator must not invent extras.
I9. When extras exist and template has an explicit extras area, use that area.
I10. When extras exist and no explicit area exists, choose/create a semantically appropriate location.
I11. Extras must NOT land in GDPR/cancellation/copyright/liability/force majeure/dispute/signature areas unless the template intentionally structures them there.
I12. New section creation must preserve hierarchy/style reasonably.
I13. Commercial totals must match OurWed commercial truth.
I14. Travel Fee behavior must remain correct (gate, not invented in rewrite).
I15. Tables must remain valid DOCX tables.
I16. Paragraph order must not be corrupted.
I17. Numbered legal clauses must not be silently renumbered incorrectly.
I18. Page/section structure must not become invalid.
I19. Signature area must remain usable.
I20. One-person data → single-party representation.
I21. Two-person data → both parties in correct locations.
I22. One-person must not leave broken second-person artifacts when adaptation is expected.
I23. Two-person must not collapse into one incorrectly.
I24. Repeated runs must not randomly relocate semantic sections (extras placement is deterministic).
I25. Generated DOCX must reopen and parse after generation.
I26. Extras prices/quantities must not appear as invented commercial lines in the contract body (names only in sparse path).
I27. Prefer fail-safe / skip insert over unsafe placement (`safe_placement_not_found`).
I28. Headers/footers must remain untouched (body-only mutation).
I29. Production artifact guard (`validate:production-supabase-artifact`) must remain intact.

# impl-log R3-A (BUG-178..182)
- started 2026-11-14T19:48:32Z

## BUG-178 (S-5) done
- Chose: commit the shown monthlySpend when spend, income or age changed (untouched wizard still auto). Re-seed rejected: needs the model's tax/contrib pipeline per income value (rule 10).
- Label -> Monthly spending. Tests: 2 new in onboarding-wizard-save (income 200k / 60k).
- Revert (condition + label removed): 2 fail; restored: 11/11 pass.

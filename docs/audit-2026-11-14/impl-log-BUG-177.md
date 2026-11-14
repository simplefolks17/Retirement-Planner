# BUG-177 impl log
- Added `ssOverrideAtAge` + `ssOverrideAnchorAge` param (retirement-income.js); App anchor state set in single setSsOverride wrapper.
- Consumers: calcRetirementIncome (claim + age-70 leg), App base call, whatIfBundle.ssInputs (scenarioSocialSecurity + work-longer rows), ssView.ssMonthly, Classic monthly tile + note, Horizon SSTimingFlow note.
- Revert-and-confirm (one at a time): anchor capture -> 2 fail; rescale fn identity -> 4 fail; claim leg -> 3 fail; age-70 leg -> 2 fail; App base calc -> 2 fail; ssMonthly raw -> 1 fail; whatIfBundle ssInputs -> initially SURVIVED, added work-longer test, then 1 fail.

## Orchestrator re-verification
- npm test 1688, lint clean, build OK, no golden-master file touched.
- Independent mutation: ssOverrideAtAge returns the raw override -> 7 failing; restored -> green.

# impl-log R4-B

## BUG-190 verification
Probe (runSimulation, currentAge 30, taxable 500k, $100k outflow): event at age 30 -> final taxable 500,000 (identical to no event); at age 31 -> 400,000. REAL: an event AT currentAge is never charged; the sim charges from currentAge+1.

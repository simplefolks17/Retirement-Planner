import { describe, it } from "vitest";
import { runSimulation } from "../simulation.js";
import { HSA_LIMIT_2026 } from "../../config/irs-2026.js";

describe("SCENARIO 6 magnitude: spouse frozen at primary retirement vs own retirement", () => {
  it("primary 55 retire 65, spouse 40 (own retirement would be 65 = 25 yrs away)", () => {
    const currentAge = 55, retirementAge = 65, lifeExpect = 90;
    const totalYears = Math.max(lifeExpect, retirementAge + 1) - currentAge; // 35
    const spouseCurrentAge = 40;

    // What the model DOES: spouse contributes only until primary retires (spouse age 50)
    const modelContribEnd = spouseCurrentAge + (retirementAge - currentAge); // 50
    // What reality would be: spouse contributes to their OWN age 65
    const realContribEnd = 65;

    const common = {
      totalYears, currentAge: spouseCurrentAge,
      currentIncome: 120000, incomeGrowth: 3, filingStatus: "mfj",
      spouseIncome: 120000, spouseIncomeGrowth: 3, returnRate: 7,
      bal401k: 150000, balRoth: 0, balTaxable: 0, balHSA: 0,
      contrib401k: 23500, contribRoth: 0, contribTaxable: 0, contribHSA: 0,
      calcEmployerMatchFn: (sal, def) => Math.min(sal * 0.04, def),
      hsaLimit: HSA_LIMIT_2026,
    };
    const modelSim = runSimulation({ ...common,
      contribEnd401k: modelContribEnd, contribEndRoth: modelContribEnd,
      contribEndTaxable: modelContribEnd, contribEndHSA: modelContribEnd });
    const realSim = runSimulation({ ...common,
      contribEnd401k: realContribEnd, contribEndRoth: realContribEnd,
      contribEndTaxable: realContribEnd, contribEndHSA: realContribEnd });

    // The household seeds the retirement walk from spouse balance at spouse age 50
    // (index = primary phase2End - 1 = 10-1 = 9).
    const phase2End = retirementAge - currentAge; // 10
    const modelSeed = modelSim[phase2End - 1];     // spouse age 50 balance
    // Reality: the spouse's trad at their own retirement age 65 (index age65-40-1=24),
    // which is the balance they'd actually bring in if the model knew their own retirement.
    const realAt65 = realSim.find(r => r.age === 65);

    console.log("\n===== SCENARIO 6 MAGNITUDE =====");
    console.log(JSON.stringify({
      modelSeeds_spouseTradAtAge50: modelSeed.tradGross,
      realSpouseTradAtOwnAge65: realAt65.tradGross,
      understatement: realAt65.tradGross - modelSeed.tradGross,
      note: "Model freezes spouse 401k at age 50 (primary retirement); spouse really works to 65",
    }, null, 2));
  });
});

import { execSync } from "child_process";

const scripts = [
  "scripts/verify-tenant-isolation.ts",
  "scripts/verify-reconciliation-invariant.ts",
  "scripts/verify-tcpa-cluster-quarantine.ts",
  "scripts/verify-hub-and-timegap.ts",
  "scripts/verify-finops-budget-cap.ts",
  "scripts/verify-rbac-actions.ts",
];

console.log("===============================================================");
console.log("  LEAD INTEGRITY OPS PLATFORM - 6-GATE VERIFICATION SUITE");
console.log("===============================================================\n");

let passed = 0;

for (const script of scripts) {
  try {
    execSync(`.\\node_modules\\.bin\\tsx.cmd ${script}`, { stdio: "inherit" });
    passed++;
  } catch (err) {
    console.error(`\nFAILED at ${script}`);
    process.exit(1);
  }
}

console.log("===============================================================");
console.log(`  ALL ${passed}/6 VERIFICATION GATES PASSED DETERMINISTICALLY!`);
console.log("===============================================================\n");

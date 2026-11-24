import { execSync } from "child_process";
import path from "path";

const tsxBin =
  process.platform === "win32"
    ? path.join("node_modules", ".bin", "tsx.cmd")
    : path.join("node_modules", ".bin", "tsx");

const scripts = [
  "scripts/verify-tenant-isolation.ts",
  "scripts/verify-reconciliation-invariant.ts",
  "scripts/verify-tcpa-cluster-quarantine.ts",
  "scripts/verify-hub-and-timegap.ts",
  "scripts/verify-finops-budget-cap.ts",
  "scripts/verify-rbac-actions.ts",
  "scripts/verify-lead-engineer-suite.ts",
];

console.log("===============================================================");
console.log("  INTEGRITY OPS - DETERMINISTIC VERIFICATION GATES");
console.log("===============================================================\n");

let passed = 0;

for (const script of scripts) {
  try {
    execSync(`"${tsxBin}" ${script}`, { stdio: "inherit" });
    passed++;
  } catch {
    console.error(`\nFAILED at ${script}`);
    process.exit(1);
  }
}

console.log("===============================================================");
console.log(`  ALL ${passed}/${scripts.length} VERIFICATION SUITES PASSED DETERMINISTICALLY!`);
console.log("===============================================================\n");

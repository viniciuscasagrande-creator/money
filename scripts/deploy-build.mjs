import { execSync } from "node:child_process";

function run(cmd) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
}

run("node scripts/prepare-prisma.mjs");
run("npx next build");

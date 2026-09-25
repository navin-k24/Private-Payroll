/**
 * Midnight Local DevNet Orchestration Script
 *
 * Commands:
 *   node scripts/devnet.mjs up   - Start midnight-node, indexer, and proof-server
 *   node scripts/devnet.mjs down - Stop and remove local devnet containers and volumes
 */

import { execSync, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const composeFile = resolve(rootDir, "docker", "standalone.yml");

function isDockerDaemonRunning() {
  try {
    const res = spawnSync("docker", ["info"], {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 5000,
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function checkEndpoint(url, timeoutMs = 2000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function devnetUp() {
  console.log("==================================================================");
  console.log("Starting Midnight Local DevNet for Private Payroll...");
  console.log("Compose configuration:", composeFile);
  console.log("==================================================================");

  if (!isDockerDaemonRunning()) {
    console.error("\n[Midnight DevNet Error] Docker daemon is not running or unreachable.");
    console.error("[Midnight DevNet Error] To start local devnet services, ensure Docker Desktop is started.");
    console.error("[Midnight DevNet Error] Once Docker is running, re-run: npm run test:midnight:integration:up\n");
    process.exit(1);
  }

  try {
    console.log("Launching containers with docker compose...");
    execSync(`docker compose -f "${composeFile}" up -d`, {
      stdio: "inherit",
      cwd: rootDir,
    });

    console.log("\nWaiting for Midnight services to initialize...");
    console.log("- Node RPC:     http://localhost:9944");
    console.log("- Indexer API:  http://localhost:8088");
    console.log("- Proof Server: http://localhost:6300");

    let proofServerReady = false;
    let indexerReady = false;
    for (let i = 0; i < 60; i++) {
      if (!proofServerReady) {
        proofServerReady = await checkEndpoint("http://localhost:6300");
      }
      if (!indexerReady) {
        indexerReady = await checkEndpoint("http://localhost:8088");
      }
      if (proofServerReady && indexerReady) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (proofServerReady && indexerReady) {
      console.log("\n[Midnight DevNet] All devnet services started successfully and are healthy.");
    } else {
      console.log(`\n[Midnight DevNet Status] Proof Server: ${proofServerReady ? "Ready" : "Pending"}, Indexer: ${indexerReady ? "Ready" : "Pending"}`);
      if (process.env.CI || process.env.MIDNIGHT_DEVNET_REQUIRED === "true") {
        console.error("[Midnight DevNet Error] DevNet services failed to become healthy within timeout.");
        process.exit(1);
      }
    }
  } catch (err) {
    console.error("\n[Midnight DevNet Error] Failed to start devnet containers:", err.message);
    process.exit(1);
  }
}

async function devnetDown() {
  console.log("==================================================================");
  console.log("Stopping Midnight Local DevNet for Private Payroll...");
  console.log("==================================================================");

  if (!isDockerDaemonRunning()) {
    console.log("[Midnight DevNet] Docker daemon is offline; no active containers to stop.");
    process.exit(0);
  }

  try {
    execSync(`docker compose -f "${composeFile}" down -v`, {
      stdio: "inherit",
      cwd: rootDir,
    });
    console.log("[Midnight DevNet] All devnet containers and volumes stopped and cleaned.");
  } catch (err) {
    console.error("[Midnight DevNet Error] Failed to stop devnet containers:", err.message);
    process.exit(1);
  }
}

const action = process.argv[2]?.toLowerCase();
if (action === "up") {
  await devnetUp();
} else if (action === "down") {
  await devnetDown();
} else {
  console.error(`Usage: node scripts/devnet.mjs <up|down>`);
  process.exit(1);
}

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractSrc = path.join(__dirname, 'contracts', 'private-payroll.compact');
const targetDir = path.join(__dirname, 'compiled');

let cmd;
if (process.platform === 'win32') {
  const wslSrc = contractSrc.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/');
  const wslTarget = targetDir.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/');
  cmd = `wsl -e sh -c "/home/n7282navin/.compact/bin/compactc --skip-zk '${wslSrc}' '${wslTarget}'"`;
} else {
  cmd = `compactc --skip-zk "${contractSrc}" "${targetDir}"`;
}

console.log(`Compiling Compact contract: ${contractSrc} -> ${targetDir}`);
execSync(cmd, { stdio: 'inherit' });
console.log('Compact compilation complete.');

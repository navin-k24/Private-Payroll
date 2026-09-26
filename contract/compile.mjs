import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractSrc = path.join(__dirname, 'contracts', 'private-payroll.compact');
const targetDir = path.join(__dirname, 'compiled');
const publicZkDir = path.join(__dirname, '..', 'public', 'zk');

const skipZk = process.argv.includes('--skip-zk');
const zkFlag = skipZk ? '--skip-zk' : '';

let cmd;
if (process.platform === 'win32') {
  const wslSrc = contractSrc.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/');
  const wslTarget = targetDir.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, '/');
  cmd = `wsl -e sh -c "/home/n7282navin/.compact/bin/compactc ${zkFlag} '${wslSrc}' '${wslTarget}'"`;
} else {
  cmd = `compactc ${zkFlag} "${contractSrc}" "${targetDir}"`;
}

console.log(`Compiling Compact contract: ${contractSrc} -> ${targetDir}`);
execSync(cmd, { stdio: 'inherit' });
console.log('Compact compilation complete.');

// Synchronize compiled ZK artifacts to public/zk for browser FetchZkConfigProvider
try {
  const keysSrc = path.join(targetDir, 'keys');
  const zkirSrc = path.join(targetDir, 'zkir');
  if (fs.existsSync(keysSrc)) {
    fs.cpSync(keysSrc, path.join(publicZkDir, 'keys'), { recursive: true, force: true });
    console.log('Synchronized keys to public/zk/keys');
  }
  if (fs.existsSync(zkirSrc)) {
    fs.cpSync(zkirSrc, path.join(publicZkDir, 'zkir'), { recursive: true, force: true });
    console.log('Synchronized zkir to public/zk/zkir');
  }
} catch (syncErr) {
  console.warn('Warning: Could not synchronize ZK artifacts to public/zk:', syncErr);
}

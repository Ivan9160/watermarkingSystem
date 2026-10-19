import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

try { process.loadEnvFile('.env'); } catch {}

const RUSTFS_EXE = process.env.RUSTFS_BIN ?? 'C:/rustfs/bin/rustfs.exe';
const DATA_DIR = path.resolve('storage-data');
mkdirSync(DATA_DIR, { recursive: true });

const children = [];

function run(name, command, args, env = {}) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const pipe = (stream) =>
    stream.on('data', (d) =>
      String(d)
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => console.log(`[${name}] ${line}`)),
    );
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const c of children) {
    if (c.pid && process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(c.pid), '/t', '/f']);
    } else {
      c.kill('SIGTERM');
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('storage', `"${RUSTFS_EXE}"`, [`"${DATA_DIR}"`], {
  RUSTFS_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? 'rustfsadmin',
  RUSTFS_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? 'rustfsadmin',
  RUSTFS_ADDRESS: ':9000',
  RUSTFS_CONSOLE_ENABLE: 'true',
  RUSTFS_CONSOLE_ADDRESS: ':9001',
});

run('backend', 'npm', ['run', 'start:dev']);
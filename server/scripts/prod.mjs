import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const WINDOWS = process.platform === 'win32';

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // .env is optional if environment variables are provided externally.
}

process.chdir(ROOT);
process.env.NODE_ENV = 'production';

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const RUSTFS_BIN = WINDOWS
  ? (process.env.RUSTFS_BIN || 'C:/rustfs/bin/rustfs.exe')
  : 'rustfs';

const DATA_DIR = path.resolve(ROOT, 'storage-data');

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || '127.0.0.1';
const MINIO_PORT = Number(process.env.MINIO_PORT || 9000);

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

const API_PORT = 3000;

const BACKEND_SCRIPT = 'start:prod';
const WORKER_SCRIPT = 'start:worker:prod';

const children = [];
let closing = false;

function log(name, message) {
  console.log(`[${name}] ${message}`);
}


function run(name, command, args = [], env = {}) {
  log(name, `Starting: ${command} ${args.join(' ')}`);

  let executable = command;

  if (
    executable.includes('/') ||
    executable.includes('\\')
  ) {
    executable = path.resolve(ROOT, executable);
  }

  const child = spawn(executable, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    detached: !WINDOWS,
    windowsHide: WINDOWS,
  });

  children.push({ name, child });

  function pipe(stream) {
    if (!stream) return;

    const reader = createInterface({ input: stream });

    reader.on('line', (line) => {
      if (line.trim()) {
        log(name, line);
      }
    });
  }

  pipe(child.stdout);
  pipe(child.stderr);

  child.on('error', (error) => {
    log(name, `Failed to start: ${error.message}`);
    void shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (closing) return;

    log(
      name,
      `Unexpected exit: code=${code}, signal=${signal}`,
    );

    void shutdown(code ?? 1);
  });

  return child;
}


// --------------------------------------------------
// Redis
// --------------------------------------------------

function redisPing(timeout = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: REDIS_HOST,
      port: REDIS_PORT,
    });

    let data = '';
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeout);

    socket.once('connect', () => {
      const password = process.env.REDIS_PASSWORD;

      if (password) {
        socket.write(
          `*2\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(password)}\r\n${password}\r\n`,
        );
      }

      socket.write('*1\r\n$4\r\nPING\r\n');
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();

      if (data.includes('+PONG')) finish(true);
      else if (/(^|\r\n)-/.test(data)) finish(false); // -ERR / -NOAUTH / -WRONGPASS
    });

    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
    socket.once('close', () => finish(false));
  });
}

function startRedis() {
  log('redis', 'Redis is down, trying to start it (non-interactive)...');

  const startCmd =
    'systemctl start redis-server || service redis-server start';

  let command;
  let args;

  if (WINDOWS) {
    // Запуск у WSL від root — пароль не потрібен
    command = 'wsl.exe';
    args = ['-u', 'root', '-e', 'sh', '-c', startCmd];
  } else if (process.getuid?.() === 0) {
    command = 'sh';
    args = ['-c', startCmd];
  } else {
    // -n = ніколи не питати пароль
    command = 'sudo';
    args = ['-n', 'sh', '-c', startCmd];
  }

  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'], // stdin закритий — зависання неможливе
    windowsHide: WINDOWS,
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      WINDOWS
        ? 'Could not start Redis in WSL. Run once: wsl -u root -e systemctl enable --now redis-server'
        : 'Could not start Redis without a password. Run once manually: sudo systemctl enable --now redis-server',
    );
  }
}

async function checkRedis() {
  log('redis', `Checking Redis at ${REDIS_HOST}:${REDIS_PORT}...`);

  if (await redisPing()) {
    log('redis', 'Redis is ready.');
    return;
  }

  startRedis();

  const started = Date.now();

  while (Date.now() - started < 15_000) {
    if (await redisPing()) {
      log('redis', 'Redis is ready.');
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `Redis is unavailable at ${REDIS_HOST}:${REDIS_PORT}.`,
  );
}
// --------------------------------------------------
// TCP readiness
// --------------------------------------------------

function waitForPort(port, name, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    function check() {
      const socket = net.createConnection({
        host: '127.0.0.1',
        port,
      });

      socket.setTimeout(1000);

      socket.once('connect', () => {
        socket.destroy();

        log(name, `Ready on port ${port}.`);
        resolve();
      });

      socket.once('error', () => {
        socket.destroy();
        retry();
      });

      socket.once('timeout', () => {
        socket.destroy();
        retry();
      });
    }

    function retry() {
      if (closing) {
        reject(new Error(`${name} startup cancelled.`));
        return;
      }

      if (Date.now() - started >= timeout) {
        reject(
          new Error(`${name} did not start on port ${port}.`),
        );
        return;
      }

      setTimeout(check, 500);
    }

    check();
  });
}

// --------------------------------------------------
// RustFS
// --------------------------------------------------

async function startRustFS() {
  mkdirSync(DATA_DIR, { recursive: true });

  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error(
      'MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be configured in .env',
    );
  }

  if (
    accessKey === 'rustfsadmin' ||
    secretKey === 'rustfsadmin'
  ) {
    throw new Error(
      'Default RustFS credentials are not allowed in production.',
    );
  }

  const child = run(
    'storage',
    RUSTFS_BIN,
    [
      'server',
      '--address',
      `${MINIO_ENDPOINT}:${MINIO_PORT}`,
      '--console-address',
      '127.0.0.1:9001',
      DATA_DIR,
    ],
    {
      RUSTFS_ACCESS_KEY: accessKey,
      RUSTFS_SECRET_KEY: secretKey,
      RUSTFS_CONSOLE_ENABLE: 'true',
    },
  );

  await waitForPort(MINIO_PORT, 'RustFS');

  return child;
}

// --------------------------------------------------
// Production npm scripts
// --------------------------------------------------

function assertNpmScript(scriptName) {
  const packageJson = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );

  if (!packageJson.scripts?.[scriptName]) {
    throw new Error(
      `Missing npm script "${scriptName}" in server/package.json`,
    );
  }
}

function startNpm(name, script) {
  assertNpmScript(script);

  const command = WINDOWS
    ? (process.env.ComSpec || 'cmd.exe')
    : 'npm';

  const args = WINDOWS
    ? ['/d', '/s', '/c', `npm run ${script}`]
    : ['run', script];

  return run(name, command, args, {
    NODE_ENV: 'production',
  });
}

// --------------------------------------------------
// Shutdown
// --------------------------------------------------

async function shutdown(code = 0) {
  if (closing) return;

  closing = true;

  console.log('\n[production] Stopping services...');

  for (const { name, child } of [...children].reverse()) {
    if (!child.pid || child.exitCode !== null) continue;

    log(name, 'Stopping...');

    if (WINDOWS) {
      spawnSync(
        'taskkill',
        ['/PID', String(child.pid), '/T', '/F'],
        {
          stdio: 'ignore',
          windowsHide: true,
        },
      );
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  }

  log('production', 'Shutdown complete.');

  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

// --------------------------------------------------
// Main
// --------------------------------------------------

async function main() {
  log('production', `Root: ${ROOT}`);
  log('production', `Platform: ${process.platform}`);

  // 1. Validate compiled backend.

  if (!existsSync(path.join(ROOT, 'dist'))) {
    throw new Error(
      'Backend dist/ not found. Run npm run build first.',
    );
  }

  // 2. Redis.

  checkRedis();

  // 3. RustFS.

  await startRustFS();


  startNpm('backend', BACKEND_SCRIPT);

  startNpm('worker', WORKER_SCRIPT);

  // 6. Wait for API.

  await waitForPort(API_PORT, 'Backend');

  console.log('');

  log('production', 'All application services are running.');
  log('production', `API: http://127.0.0.1:${API_PORT}`);
  log('production', 'Frontend is served by Nginx.');
  log('production', 'Press Ctrl+C to stop managed processes.');
}

main().catch(async (error) => {
  console.error(`\n[production] ERROR: ${error.message}`);
  await shutdown(1);
});
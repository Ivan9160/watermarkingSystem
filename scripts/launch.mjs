
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS = process.platform === 'win32';

// Заміни frontend на фактичну назву папки фронтенда.
const FRONTEND_DIR = resolve(ROOT, 'frontend');
const BACKEND_DIR = resolve(ROOT, 'server');

const NGINX_BIN =
  process.env.NGINX_BIN ??
  (WINDOWS ? 'C:/nginx/nginx.exe' : 'nginx');

const NGINX_PREFIX = `${ROOT.replaceAll('\\', '/')}/`;

const NGINX_ARGS = [
  '-p', NGINX_PREFIX,
  '-e', 'nginx/logs/error.log',
  '-c', 'nginx/nginx.conf',
];

const processes = [];
let nginxStarted = false;
let stopping = false;

function log(message) {
  console.log(`[stack] ${message}`);
}

function startNpm(directory, script, name) {
  const packagePath = resolve(directory, 'package.json');

  if (!existsSync(packagePath)) {
    throw new Error(`${name}: package.json not found: ${packagePath}`);
  }

  log(`Starting ${name}: npm run ${script}`);

  const child = spawn(
    WINDOWS ? 'cmd.exe' : 'npm',
    WINDOWS
      ? ['/d', '/s', '/c', `npm run ${script}`]
      : ['run', script],
    {
      cwd: directory,
      stdio: 'inherit',
      detached: !WINDOWS,
      windowsHide: false,
      env: process.env,
    },
  );

  processes.push({ name, child });

  child.on('error', (error) => {
    console.error(`[${name}] ${error.message}`);
    void shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (stopping) return;

    console.error(
      `[${name}] Stopped unexpectedly: code=${code}, signal=${signal}`,
    );

    void shutdown(code === 0 ? 1 : code ?? 1);
  });

  return child;
}

function nginxCommand(args) {
  const useSudo =
    !WINDOWS && process.env.NGINX_USE_SUDO === '1';

  const command = useSudo ? 'sudo' : NGINX_BIN;

  const fullArgs = useSudo
    ? [NGINX_BIN, ...NGINX_ARGS, ...args]
    : [...NGINX_ARGS, ...args];

  const result = spawnSync(command, fullArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Nginx command failed: ${args.join(' ')}`);
  }
}

function startNginx() {
  mkdirSync(resolve(ROOT, 'nginx/logs'), { recursive: true });

  const tempDirectories = [
    'client_body_temp',
    'proxy_temp',
    'fastcgi_temp',
    'uwsgi_temp',
    'scgi_temp',
  ];

  for (const directory of tempDirectories) {
    mkdirSync(resolve(ROOT, 'nginx/temp', directory), {
      recursive: true,
    });
  }

  const requiredFiles = [
    'nginx/nginx.conf',
    'nginx/mime.types',
    '.local-certs/localhost.pem',
    '.local-certs/localhost-key.pem',
  ];

  for (const file of requiredFiles) {
    if (!existsSync(resolve(ROOT, file))) {
      throw new Error(`Required file not found: ${file}`);
    }
  }

  log('Checking Nginx configuration...');
  nginxCommand(['-t']);

  log('Starting Nginx...');
  nginxCommand([]);

  nginxStarted = true;
}

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;

  log('Stopping services...');

  if (nginxStarted) {
    try {
      nginxCommand(['-s', 'quit']);
      log('Nginx stopped.');
    } catch (error) {
      console.error(`Nginx shutdown: ${error.message}`);
    }
  }

  for (const { name, child } of [...processes].reverse()) {
    if (!child.pid || child.exitCode !== null) continue;

    log(`Stopping ${name}...`);

    if (WINDOWS) {
      spawnSync(
        'taskkill',
        ['/PID', String(child.pid), '/T', '/F'],
        { stdio: 'ignore' },
      );
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  }

  log('All services stopped.');
  process.exit(exitCode);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

async function main() {
  log(`Project: ${ROOT}`);

  // Frontend
  startNpm(FRONTEND_DIR, 'prod', 'Frontend');

  // NestJS backend + worker
  startNpm(BACKEND_DIR, 'prod:all', 'Backend');

  // Reverse proxy
  startNginx();

  console.log('');
  log('ALL SERVICES STARTED');
  log('Frontend: https://localhost/');
  log('Backend:  https://localhost/api/');
  log('Press Ctrl+C to stop everything.');
}

main().catch(async (error) => {
  console.error(`[stack] ERROR: ${error.message}`);
  await shutdown(1);
});

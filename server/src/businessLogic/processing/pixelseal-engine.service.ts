import {
  Injectable,
  Logger,
  OnModuleDestroy,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { InvisibleWatermarkConfig } from './watermark-config.ts';
import { db } from '../../prisma/db.ts';

interface PixelSealEmbedRequest {
  op: 'embed';
  method: 'pixelseal';
  input: string;
  output: string;
  id: string;
  keyId?: string;
  selfCheck: boolean;
  jobId: string;
}

interface PixelSealVerifyRequest {
  op: 'verify';
  method: 'pixelseal';
  input: string;
  keyId?: string;
  jobId: string;
}

type PixelSealRequest =
  | PixelSealEmbedRequest
  | PixelSealVerifyRequest;

interface PixelSealResponse {
  ok: boolean;
  op?: string;
  method?: string;
  id?: string | null;
  keyId?: string | null;
  width?: number;
  height?: number;
  psnr?: number;
  seconds?: number;
  selfCheck?: boolean;
  jobId?: string;
  error?: string;
  message?: string;
  found?: boolean;
  tagDistance?: number | null;
  [key: string]: unknown;
}

export interface PixelSealVerificationResult extends PixelSealResponse {
  found: boolean;
  id: string | null;
  tagDistance: number | null;
}

export type FootprintMasterSource = 'uploaded' | 'stored' | 'generated';

export interface PixelSealFootprintResult {
  present: boolean;
  z: number;
  retention: number;
  threshold: number;
  verdict: string;
  aligned: boolean;
  masterSource: FootprintMasterSource;
  nulls: number;
  warning: string | null;
}

interface PendingRequest {
  child: ChildProcessWithoutNullStreams;
  jobId: string;
  resolve: (value: PixelSealResponse) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_FOOTPRINT_TIMEOUT_MS = 900_000;
const DEFAULT_NULLS = 12;
const DEFAULT_THRESHOLD = 6.0;
const DEFAULT_SEED = 3;

@Injectable()
export class PixelSealEngineService implements OnModuleDestroy {
  private readonly logger = new Logger(
    PixelSealEngineService.name,
  );

  private child?: ChildProcessWithoutNullStreams;
  private stdoutBuffer = '';
  private stderrTail = '';
  private pending?: PendingRequest;

  private queue: Promise<unknown> = Promise.resolve();

  async embed(args: {
    organizationId: string;
    inputPath: string;
    outputPath: string;
    config: InvisibleWatermarkConfig;
    jobId?: string;
  }): Promise<PixelSealResponse> {
    const jobId = args.jobId ?? randomUUID();

    const watermarkId = await this.getOrganizationWatermarkId(
      args.organizationId,
    );

    const request: PixelSealEmbedRequest = {
      op: 'embed',
      method: args.config.method ?? 'pixelseal',
      input: resolve(args.inputPath),
      output: resolve(args.outputPath),
      id: watermarkId,

      ...(args.config.keyId
        ? { keyId: args.config.keyId }
        : {}),

      selfCheck: args.config.selfCheck ?? true,
      jobId,
    };

    return this.enqueue(request);
  }

  async verify(args: {
    inputPath: string;
    keyId?: string;
    jobId?: string;
  }): Promise<PixelSealVerificationResult> {
    const jobId = args.jobId ?? randomUUID();

    const request: PixelSealVerifyRequest = {
      op: 'verify',
      method: 'pixelseal',
      input: resolve(args.inputPath),
      ...(args.keyId ? { keyId: args.keyId } : {}),
      jobId,
    };

    const response = await this.enqueue(request);

    return {
      ...response,
      found: response.found === true,
      id: typeof response.id === 'string'
        ? response.id.toLowerCase()
        : null,
      tagDistance: typeof response.tagDistance === 'number'
        ? response.tagDistance
        : null,
    };
  }

  async footprint(args: {
    organizationId: string;
    originalPath: string;
    suspectPath: string;
    masterPath?: string;
    nulls?: number;
    threshold?: number;
    seed?: number;
    jobId?: string;
  }): Promise<PixelSealFootprintResult> {
    const jobId = args.jobId ?? randomUUID();

    const nulls = Number.isInteger(args.nulls) && (args.nulls as number) >= 2
      ? (args.nulls as number)
      : DEFAULT_NULLS;

    const threshold = typeof args.threshold === 'number' &&
      Number.isFinite(args.threshold)
      ? args.threshold
      : DEFAULT_THRESHOLD;

    const seed = args.seed ?? DEFAULT_SEED;

    let tempDir: string | undefined;
    let masterPath = args.masterPath;
    let masterSource: FootprintMasterSource = 'uploaded';

    try {
      if (!masterPath) {
        tempDir = await mkdtemp(join(tmpdir(), 'footprint-'));
        masterPath = join(tempDir, 'master.png');
        masterSource = 'generated';

        await this.embed({
          organizationId: args.organizationId,
          inputPath: args.originalPath,
          outputPath: masterPath,
          config: { method: 'pixelseal', selfCheck: true },
          jobId: `${jobId}-master`,
        });
      }

      const finalMasterPath = masterPath;

      const output = await this.enqueueTask(
        () => this.runFootprintScript({
          originalPath: args.originalPath,
          masterPath: finalMasterPath,
          suspectPath: args.suspectPath,
          nulls,
          threshold,
          seed,
          jobId,
        }),
      );

      const z = this.readNumber(output, /^z\s*=\s*(\S+)/m);
      const retention = this.readNumber(
        output,
        /^retention a\s*=\s*(\S+)/m,
      );

      if (z === null || retention === null) {
        throw new InternalServerErrorException(
          `Footprint check returned no result for job ${jobId}: ${output.slice(-500)}`,
        );
      }

      const present = z >= threshold;

      return {
        present,
        z,
        retention,
        threshold,
        verdict: present ? 'OUR FOOTPRINT PRESENT' : 'not shown',
        aligned: /aligned to the original first/.test(output),
        masterSource,
        nulls,
        warning: null,
      };
    } finally {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true })
          .catch(() => undefined);
      }
    }
  }

  private readNumber(text: string, pattern: RegExp): number | null {
    const match = pattern.exec(text);

    if (!match?.[1]) {
      return null;
    }

    const value = Number(match[1]);

    return Number.isFinite(value) ? value : null;
  }

  private runFootprintScript(args: {
    originalPath: string;
    masterPath: string;
    suspectPath: string;
    nulls: number;
    threshold: number;
    seed: number;
    jobId: string;
  }): Promise<string> {
    const root = resolve(
      process.env['PIXELSEAL_ROOT'] ?? process.cwd(),
    );

    const defaultPythonPath =
      process.platform === 'win32'
        ? join('.venv-pixelseal', 'Scripts', 'python.exe')
        : join('.venv-pixelseal', 'bin', 'python');

    const python = resolve(
      root,
      process.env['PIXELSEAL_PYTHON'] ?? defaultPythonPath,
    );

    const script = resolve(
      root,
      process.env['PIXELSEAL_FOOTPRINT_SCRIPT'] ??
        'engine/footprint_check.py',
    );

    if (!existsSync(python)) {
      throw new Error(
        `PixelSeal Python was not found at ${python}. Check PIXELSEAL_ROOT and PIXELSEAL_PYTHON.`,
      );
    }

    if (!existsSync(script)) {
      throw new Error(
        `Footprint script was not found at ${script}. Check PIXELSEAL_FOOTPRINT_SCRIPT.`,
      );
    }

    const timeoutMs = this.getTimeoutMs('footprint');

    return new Promise<string>((resolveResult, rejectResult) => {
      const child = spawn(
        python,
        [
          script,
          '--original', resolve(args.originalPath),
          '--master', resolve(args.masterPath),
          '--suspect', resolve(args.suspectPath),
          '--embedder', 'pixelseal',
          '--nulls', String(args.nulls),
          '--threshold', String(args.threshold),
          '--seed', String(args.seed),
        ],
        {
          cwd: dirnameOf(script),
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );

      let stdout = '';
      let stderr = '';
      let finished = false;

      const timer = setTimeout(() => {
        if (finished) return;

        finished = true;
        child.kill();

        rejectResult(
          new Error(
            `Footprint check timed out after ${timeoutMs} ms for job ${args.jobId}.`,
          ),
        );
      }, timeoutMs);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });

      child.stderr.on('data', (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-12_000);
      });

      child.on('error', (error) => {
        if (finished) return;

        finished = true;
        clearTimeout(timer);

        rejectResult(
          new Error(
            `Could not start footprint check: ${error.message}`,
          ),
        );
      });

      child.on('close', (code) => {
        if (finished) return;

        finished = true;
        clearTimeout(timer);

        if (/^z\s*=/m.test(stdout)) {
          resolveResult(stdout);
          return;
        }

        const reason = (stderr.trim() || stdout.trim()).slice(-500);

        rejectResult(
          new Error(
            `Footprint check failed (code=${code}): ${reason || 'no output'}`,
          ),
        );
      });
    });
  }

  private sendOne(
    request: PixelSealRequest,
  ): Promise<PixelSealResponse> {
    const child = this.getOrStartProcess();
    const timeoutMs = this.getTimeoutMs(request.op);

    return new Promise<PixelSealResponse>(
      (resolveResult, rejectResult) => {
        const pending: PendingRequest = {
          child,
          jobId: request.jobId,
          resolve: resolveResult,
          reject: rejectResult,

          timeout: setTimeout(() => {
            if (this.pending !== pending) {
              return;
            }

            this.pending = undefined;

            if (this.child === child) {
              this.child = undefined;
            }

            child.kill();

            rejectResult(
              new Error(
                `PixelSeal timed out after ${timeoutMs} ms for job ${request.jobId}.${this.stderrSuffix()}`,
              ),
            );
          }, timeoutMs),
        };

        this.pending = pending;

        const line = `${JSON.stringify(request)}\n`;

        child.stdin.write(line, 'utf8', (error) => {
          if (!error || this.pending !== pending) {
            return;
          }

          clearTimeout(pending.timeout);
          this.pending = undefined;

          rejectResult(
            new Error(
              `Could not write PixelSeal request: ${error.message}`,
            ),
          );

          if (this.child === child) {
            this.child = undefined;
          }

          child.kill();
        });
      },
    );
  }

  private getOrStartProcess(): ChildProcessWithoutNullStreams {
    if (
      this.child &&
      this.child.exitCode === null &&
      this.child.signalCode === null
    ) {
      return this.child;
    }

    const root = resolve(
      process.env['PIXELSEAL_ROOT'] ?? process.cwd(),
    );

    const defaultPythonPath =
      process.platform === 'win32'
        ? join('.venv-pixelseal', 'Scripts', 'python.exe')
        : join('.venv-pixelseal', 'bin', 'python');

    const python = resolve(
      root,
      process.env['PIXELSEAL_PYTHON'] ?? defaultPythonPath,
    );

    const enginePath = resolve(
      root,
      process.env['PIXELSEAL_ENGINE_PATH'] ?? 'engine/engine.py',
    );

    if (!existsSync(python)) {
      throw new Error(
        `PixelSeal Python was not found at ${python}. Check PIXELSEAL_ROOT and PIXELSEAL_PYTHON.`,
      );
    }

    if (!existsSync(enginePath)) {
      throw new Error(
        `PixelSeal engine was not found at ${enginePath}. Check PIXELSEAL_ROOT and PIXELSEAL_ENGINE_PATH.`,
      );
    }

    this.stdoutBuffer = '';
    this.stderrTail = '';

    this.logger.log(
      `Starting PixelSeal engine. Root: ${root}`,
    );

    this.logger.log(
      `Python: ${python}`,
    );

    this.logger.log(
      `Engine: ${enginePath}`,
    );

    const child = spawn(
      python,
      [enginePath, '--serve'],
      {
        cwd: root,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      this.handleStdout(child, chunk);
    });

    child.stderr.on('data', (chunk: string) => {
      if (this.child === child) {
        this.stderrTail =
          `${this.stderrTail}${chunk}`.slice(-12_000);

        this.logger.warn(
          `[PixelSeal Python] ${chunk.trim()}`,
        );
      }
    });

    child.on('error', (error) => {
      this.failPending(
        child,
        new Error(
          `Could not start PixelSeal Python process: ${error.message}`,
        ),
      );

      if (this.child === child) {
        this.child = undefined;
      }
    });

    child.on('exit', (code, signal) => {
      const details =
        `PixelSeal process exited (code=${code}, signal=${signal}).${this.stderrSuffix()}`;

      this.failPending(
        child,
        new Error(details),
      );

      if (this.child === child) {
        this.child = undefined;
      }

      this.logger.error(details);
    });

    this.logger.log(
      'PixelSeal engine process started.',
    );

    return child;
  }

  private handleStdout(
    child: ChildProcessWithoutNullStreams,
    chunk: string,
  ): void {
    if (this.child !== child) {
      return;
    }

    this.stdoutBuffer += chunk;

    const lines = this.stdoutBuffer.split(/\r?\n/);

    this.stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const pending = this.pending;

      if (!pending || pending.child !== child) {
        this.logger.warn(
          `Ignoring unsolicited PixelSeal output: ${line.slice(0, 300)}`,
        );
        continue;
      }

      let response: PixelSealResponse;

      try {
        response = JSON.parse(line) as PixelSealResponse;
      } catch {
        clearTimeout(pending.timeout);
        this.pending = undefined;

        if (this.child === child) {
          this.child = undefined;
        }

        child.kill();

        pending.reject(
          new Error(
            `PixelSeal returned a non-JSON line for job ${pending.jobId}: ${line.slice(0, 500)}`,
          ),
        );

        continue;
      }

      clearTimeout(pending.timeout);
      this.pending = undefined;

      if (response.ok === true) {
        pending.resolve(response);
      } else {
        pending.reject(
          new Error(
            `PixelSeal failed for job ${pending.jobId}: ${
              response.error ??
              response.message ??
              'unknown engine error'
            }`,
          ),
        );
      }
    }
  }

  private failPending(
    child: ChildProcessWithoutNullStreams,
    error: Error,
  ): void {
    const pending = this.pending;

    if (!pending || pending.child !== child) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending = undefined;

    pending.reject(error);
  }

  private getTimeoutMs(op: PixelSealRequest['op'] | 'footprint'): number {
    const name = op === 'footprint'
      ? 'PIXELSEAL_FOOTPRINT_TIMEOUT_MS'
      : 'PIXELSEAL_TIMEOUT_MS';

    const fallback = op === 'footprint'
      ? DEFAULT_FOOTPRINT_TIMEOUT_MS
      : DEFAULT_TIMEOUT_MS;

    const value = Number(process.env[name] ?? fallback);

    return Number.isFinite(value) && value >= 1_000
      ? value
      : fallback;
  }

  private stderrSuffix(): string {
    return this.stderrTail
      ? ` Python stderr: ${this.stderrTail}`
      : '';
  }

  onModuleDestroy(): void {
    const child = this.child;
    this.child = undefined;

    if (this.pending) {
      clearTimeout(this.pending.timeout);

      this.pending.reject(
        new Error(
          'NestJS worker is shutting down while PixelSeal is running.',
        ),
      );

      this.pending = undefined;
    }

    child?.kill();
  }

  private async getOrganizationWatermarkId(
    organizationId: string,
  ): Promise<string> {
    const organization = await db.orm.public.Organization
      .where({ id: organizationId })
      .select('invisibleWatermarkId')
      .first();

    if (!organization) {
      throw new NotFoundException(
        `Organization ${organizationId} not found`,
      );
    }

    const watermarkId = organization.invisibleWatermarkId;

    if (
      typeof watermarkId !== 'string' ||
      !/^[0-9a-f]{10}$/i.test(watermarkId)
    ) {
      throw new InternalServerErrorException(
        `Organization ${organizationId} has an invalid invisible watermark ID`,
      );
    }

    return watermarkId.toLowerCase();
  }

  private enqueue(
    request: PixelSealRequest,
  ): Promise<PixelSealResponse> {
    return this.enqueueTask(() => this.sendOne(request));
  }

  private enqueueTask<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);

    this.queue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
}

function dirnameOf(filePath: string): string {
  return resolve(filePath, '..');
}
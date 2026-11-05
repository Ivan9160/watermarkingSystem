
import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';

import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { InvisibleWatermarkConfig } from './watermark-config.ts';

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

interface PixelSealResponse {
  ok: boolean;
  op?: string;
  method?: string;
  id?: string;
  keyId?: string | null;
  width?: number;
  height?: number;
  psnr?: number;
  seconds?: number;
  selfCheck?: boolean;
  jobId?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

interface PendingRequest {
  child: ChildProcessWithoutNullStreams;
  jobId: string;
  resolve: (value: PixelSealResponse) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}

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
    inputPath: string;
    outputPath: string;
    config: InvisibleWatermarkConfig;
    jobId?: string;
  }): Promise<PixelSealResponse> {
    const jobId = args.jobId ?? randomUUID();

    const request: PixelSealEmbedRequest = {
      op: 'embed',
      method: args.config.method ?? 'pixelseal',
      input: resolve(args.inputPath),
      output: resolve(args.outputPath),
      id: args.config.id,

      ...(args.config.keyId
        ? { keyId: args.config.keyId }
        : {}),

      selfCheck: args.config.selfCheck ?? true,
      jobId,
    };

    const task = this.queue.then(
      () => this.sendOne(request),
    );

    this.queue = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  }

  private sendOne(
    request: PixelSealEmbedRequest,
  ): Promise<PixelSealResponse> {
    const child = this.getOrStartProcess();
    const timeoutMs = this.getTimeoutMs();

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

    // All relative paths are resolved from PIXELSEAL_ROOT.
    // PIXELSEAL_ROOT defaults to the current working directory.
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

  private getTimeoutMs(): number {
    const value = Number(
      process.env['PIXELSEAL_TIMEOUT_MS'] ?? 180_000,
    );

    return Number.isFinite(value) && value >= 1_000
      ? value
      : 180_000;
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
}

import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const MAX_LOG_CHARS = 8_000;

/**
 * Adapter to local CLI/EXE .
 * Contract: <engine> --input <file> --output <file> --config <json>
 * Exit code 0 = success. Adjust buildArgs to match your actual CLI.
 * 
 */


@Injectable()
export class WatermarkEngineService {
  private readonly executable = resolve(import.meta.dirname, '../../../', process.env['WATERMARK_ENGINE_PATH'] ?? './engine/watermark.exe');
  private readonly timeoutMs = Number(process.env['WATERMARK_ENGINE_TIMEOUT_MS'] ?? 60_000);

  async apply(params: {
    inputPath: string;
    outputPath: string;
    config: unknown;
  }): Promise<{ stdout: string; stderr: string }> {
    if (!this.executable) {
      throw new Error('WATERMARK_ENGINE_PATH is not configured');
    }

    const configPath = join(dirname(params.inputPath), 'config.json');
    await writeFile(configPath, JSON.stringify(params.config ?? {}), 'utf8');

    return new Promise((resolve, reject) => {
      const args = this.buildArgs(params.inputPath, params.outputPath, configPath);
      const isScript = /\.(m?js|cjs)$/i.test(this.executable!);

      const child = spawn(
        isScript ? process.execPath : this.executable!,   // process.execPath = node
        isScript ? [this.executable!, ...args] : args,
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
          windowsHide: true,
          timeout: this.timeoutMs,
          killSignal: 'SIGKILL',
        },
      );


      // const child = spawn(
      //   this.executable!,
      //   this.buildArgs(params.inputPath, params.outputPath, configPath),
      //   {
      //     stdio: ['ignore', 'pipe', 'pipe'],
      //     shell: false, 
      //     windowsHide: true,
      //     timeout: this.timeoutMs,
      //     killSignal: 'SIGKILL',
      //   },
      // );

      let stdout = '';
      let stderr = '';
      const tail = (acc: string, chunk: Buffer) => (acc + chunk.toString()).slice(-MAX_LOG_CHARS);

      child.stdout.on('data', (c: Buffer) => (stdout = tail(stdout, c)));
      child.stderr.on('data', (c: Buffer) => (stderr = tail(stderr, c)));
      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (code === 0) return resolve({ stdout, stderr });
        reject(
          new Error(
            `Watermark engine failed (${code !== null ? `exit ${code}` : signal}): ${stderr.slice(-500)}`,
          ),
        );
      });
    });
  }

  private buildArgs(input: string, output: string, config: string): string[] {
    return ['--input', input, '--output', output, '--config', config];
  }
}

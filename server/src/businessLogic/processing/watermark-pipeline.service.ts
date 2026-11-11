
import { Injectable } from '@nestjs/common';

import { access, rm } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { randomUUID } from 'node:crypto';

import { PixelSealEngineService } from './pixelseal-engine.service.ts';
import { WatermarkEngineService } from './watermark-engine.service.ts';

import {
    assertBatchWatermarkConfig,
    type BatchWatermarkConfig,
} from './watermark-config.ts';

@Injectable()
export class WatermarkPipelineService {
    constructor(
        private readonly visibleEngine: WatermarkEngineService,
        private readonly invisibleEngine: PixelSealEngineService,
    ) {}

    /**
     * Applies selected watermark mechanisms.
     *
     * If both are enabled:
     * 1. Visible watermark
     * 2. Invisible PixelSeal watermark
     *
     * The invisible watermark ID is loaded from the organization in DB.
     * The PixelSeal secret key is loaded from WM_KEY environment variable.
     *
     * If PixelSeal is enabled, the final output is PNG.
     */
    async apply(args: {
        organizationId: string;
        inputPath: string;
        outputPath: string;
        config: unknown;
        jobId?: string;
    }): Promise<string> {
        assertBatchWatermarkConfig(args.config);

        const config = args.config as BatchWatermarkConfig;

        if (
            config.applyInvisibleWatermark &&
            !process.env['WM_KEY']?.trim()
        ) {
            throw new Error(
                'WM_KEY is not configured. Add WM_KEY to the backend .env file.',
            );
        }

        const finalOutputPath = config.applyInvisibleWatermark
            ? this.asPngPath(args.outputPath)
            : args.outputPath;

        let visibleIntermediatePath: string | undefined;
        let currentInputPath = args.inputPath;

        try {
            // 1. Visible watermark
            if (config.applyVisibleWatermark) {
                const visibleOutputPath = config.applyInvisibleWatermark
                    ? join(
                        dirname(finalOutputPath),
                        `.visible-${randomUUID()}.png`,
                    )
                    : finalOutputPath;

                await this.visibleEngine.apply({
                    inputPath: currentInputPath,
                    outputPath: visibleOutputPath,
                    config: config.applyInvisibleWatermark
                        ? {
                            ...(config.visibleWatermarkConfig ?? {}),
                            format: 'png',
                        }
                        : config.visibleWatermarkConfig,
                });

                await this.assertOutputExists(
                    visibleOutputPath,
                    'visible watermark',
                );

                currentInputPath = visibleOutputPath;

                if (config.applyInvisibleWatermark) {
                    visibleIntermediatePath = visibleOutputPath;
                }
            }

            // 2. Invisible PixelSeal watermark
            if (config.applyInvisibleWatermark) {
                await this.invisibleEngine.embed({
                    organizationId: args.organizationId,
                    inputPath: currentInputPath,
                    outputPath: finalOutputPath,

                    // ID is retrieved from Organization in DB.
                    // Secret key is inherited from process.env.WM_KEY.
                    config: {
                        method: 'pixelseal',
                        selfCheck: true,
                    },

                    jobId: args.jobId,
                });

                await this.assertOutputExists(
                    finalOutputPath,
                    'PixelSeal invisible watermark',
                );
            }

            return finalOutputPath;
        } finally {
            if (visibleIntermediatePath) {
                await rm(
                    visibleIntermediatePath,
                    { force: true },
                ).catch(() => undefined);
            }
        }
    }

    private asPngPath(outputPath: string): string {
        const parsed = parse(outputPath);

        if (parsed.ext.toLowerCase() === '.png') {
            return outputPath;
        }

        return join(
            parsed.dir,
            `${parsed.name}.png`,
        );
    }

    private async assertOutputExists(
        filePath: string,
        stage: string,
    ): Promise<void> {
        try {
            await access(filePath);
        } catch {
            throw new Error(
                `${stage} completed without creating its output file: ${filePath}`,
            );
        }
    }
}

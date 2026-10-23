import { type Job, UnrecoverableError } from 'bullmq';

export function isFinalFailure(job: Job | undefined, error: Error): boolean {
  if (!job) return false;
  return (
    error instanceof UnrecoverableError ||
    job.attemptsMade >= (job.opts.attempts ?? 1)
  );
}

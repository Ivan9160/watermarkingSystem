export const StorageKeys = {
  original: (orgId: string, batchId: string, imageJobId: string, ext: string) =>
    `originals/${orgId}/${batchId}/${imageJobId}.${ext}`,

  processed: (orgId: string, batchId: string, imageJobId: string, ext: string) =>
    `processed/${orgId}/${batchId}/${imageJobId}.${ext}`,
};

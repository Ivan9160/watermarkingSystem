export declare function safeFetchImage(rawUrl: string, maxBytes?: number): Promise<{
    buf: Buffer<ArrayBuffer>;
    contentType: string;
}>;

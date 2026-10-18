import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivate(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export async function safeFetchImage(rawUrl: string, maxBytes = 10 * 1024 * 1024) {
  const url = new URL(rawUrl);
  const ips = isIP(url.hostname) ? [url.hostname] : (await lookup(url.hostname, { all: true })).map(r => r.address);
  if (ips.some(isPrivate)) throw new Error("URL points to a private address");

  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const contentType = res.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) throw new Error("Not an image");
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new Error("File too large");

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("File too large");
  return { buf, contentType };
}
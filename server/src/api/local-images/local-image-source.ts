// Identifiers are opaque, non-public references. Never interpret them as URLs.
// The ownerId always comes from the authenticated Allegro session.
export const LOCAL_REF_PATTERN = /^waterm-local:([0-9a-f]{32}\.(?:jpg|png|webp))$/;
export const LOCAL_GROUP_PATTERN = /^LOCAL-[A-Z0-9_-]{8,70}$/;

export function localKeyFor(ownerId: number, ref: string): string | null {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) return null;
  const match = LOCAL_REF_PATTERN.exec(ref);
  return match ? `local-uploads/${ownerId}/${match[1]}` : null;
}

export function localKeyForFileId(ownerId: number, fileId: string): string | null {
  return localKeyFor(ownerId, `waterm-local:${fileId}`);
}

export function isLocalRef(value: string): boolean {
  return value.startsWith('waterm-local:');
}

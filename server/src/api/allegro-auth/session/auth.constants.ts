export const OAUTH_STATE_COOKIE = 'waterm_allegro_oauth_state';
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_STATE_TTL_SECONDS = Math.floor(OAUTH_STATE_TTL_MS / 1000);
export const SESSION_COOKIE = 'waterm_allegro_session';
export const OAUTH_COOKIE_PATH = '/api/auth/allegro';
export const SECURE_COOKIE = process.env['NODE_ENV'] === 'production';

export function oauthStateCookieName(state: string): string {
  return `${OAUTH_STATE_COOKIE}_${state}`;
}

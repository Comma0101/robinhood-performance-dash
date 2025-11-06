import { cookies } from 'next/headers';
import crypto from 'crypto';

const COOKIE_NAME = 'anon_id';

export async function getOrCreateAnonId(): Promise<string> {
  const store = await cookies();
  let id = store.get(COOKIE_NAME)?.value;
  if (!id) {
    id = crypto.randomUUID();
    // 1 year
    store.set(COOKIE_NAME, id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return id;
}

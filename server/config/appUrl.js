/**
 * Public base URL of the web app, used for links inside emails.
 *
 * CLIENT_URL is a CORS allow-list: it may hold several entries and wildcards
 * such as https://*.vercel.app. None of those can be opened by a recipient, so
 * links resolve in this order instead:
 *
 *   1. PUBLIC_APP_URL, when set (the real deployment URL),
 *   2. the first hosted (https) CLIENT_URL entry without a wildcard,
 *   3. the first CLIENT_URL entry without a wildcard,
 *   4. http://localhost:5173.
 */
const LOCAL_HOSTS = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export const getAppUrl = () => {
  const explicit = (process.env.PUBLIC_APP_URL || '').trim();

  const concreteOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin && !origin.includes('*'));

  const hostedOrigin = concreteOrigins.find(
    (origin) => origin.startsWith('https://') && !LOCAL_HOSTS.test(origin)
  );

  const base = explicit || hostedOrigin || concreteOrigins[0] || 'http://localhost:5173';
  return base.replace(/\/+$/, '');
};

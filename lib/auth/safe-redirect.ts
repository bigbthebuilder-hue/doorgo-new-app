const DEFAULT_AUTH_REDIRECT = '/account';
const MAX_DECODE_PASSES = 3;

export function getSafeLocalRedirectPath(
  value: string | null | undefined,
  requestOrigin: string,
  fallback = DEFAULT_AUTH_REDIRECT,
): string {
  const decoded = safelyDecode(value);

  if (
    !decoded ||
    !decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    decoded.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return fallback;
  }

  try {
    const origin = new URL(requestOrigin).origin;
    const target = new URL(decoded, `${origin}/`);

    if (
      target.origin !== origin ||
      target.username ||
      target.password ||
      (target.protocol !== 'http:' && target.protocol !== 'https:')
    ) {
      return fallback;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

function safelyDecode(value: string | null | undefined): string | null {
  let decoded = value?.trim();

  if (!decoded) {
    return null;
  }

  try {
    for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    }
  } catch {
    return null;
  }

  return decoded;
}

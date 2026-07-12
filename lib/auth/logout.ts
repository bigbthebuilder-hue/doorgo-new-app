import { getLogoutRedirectPath } from './auth-messages';
import { getSafeLocalRedirectPath } from './safe-redirect';

export type LocalLogoutOperations = {
  signOut: (options: { scope: 'local' }) => Promise<{ error: unknown }>;
};

export async function handleLocalLogoutRequest(
  request: Pick<Request, 'formData' | 'url'>,
  operations: LocalLogoutOperations,
): Promise<Response> {
  let requestedFailureRedirect: string | null = null;

  try {
    const formData = await request.formData();
    const value = formData.get('failureRedirect');
    requestedFailureRedirect = typeof value === 'string' ? value : null;
  } catch {
    // A missing or invalid body uses the fixed account failure destination.
  }

  let signOutFailed = false;
  try {
    const { error } = await operations.signOut({ scope: 'local' });
    signOutFailed = Boolean(error);
  } catch {
    signOutFailed = true;
  }

  const requestUrl = new URL(request.url);
  const redirectPath = signOutFailed
    ? getSafeLocalRedirectPath(
        requestedFailureRedirect,
        requestUrl.origin,
        getLogoutRedirectPath(true),
      )
    : getLogoutRedirectPath(false);

  return Response.redirect(new URL(redirectPath, requestUrl), 303);
}

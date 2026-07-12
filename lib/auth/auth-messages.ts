export function getLogoutRedirectPath(signOutFailed: boolean): string {
  return signOutFailed ? '/account?error=signout_failed' : '/login';
}

export function useRouter() { return { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch: async () => undefined }; }
export function usePathname() { return '/jobs/new'; }
export function useSearchParams() { return new URLSearchParams(); }
export function redirect(path: string): never { throw new Error(`Unexpected redirect to ${path}`); }

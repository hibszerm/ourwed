/**
 * Module-level caches that must die when auth.uid() changes.
 * Kept in a leaf module so auth reset cannot create import cycles.
 *
 * Production wedding reads must not use an in-flight demo-seed map.
 * Add future tenant caches here and clear them in clearTenantModuleCaches.
 */

export function clearTenantModuleCaches(): void {
  // Intentionally empty until a module-level tenant cache is reintroduced.
}

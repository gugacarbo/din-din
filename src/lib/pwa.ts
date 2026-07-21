export const navigationCacheName = "din-din-navigation-v1";

export function isOfflineNavigation() {
	return typeof window !== "undefined" && navigator.onLine === false;
}

export async function clearNavigationCache() {
	if (typeof window === "undefined" || !("caches" in window)) return;
	await window.caches.delete(navigationCacheName);
}

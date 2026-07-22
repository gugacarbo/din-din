export const adminInviteTokenStorageKey = "din-din-admin-invite-token";

export const inviteFragmentScript = `(() => {
	if (location.pathname !== "/admin/convite" || !location.hash) return;
	const token = location.hash.slice(1);
	if (!token) return;
	try {
		sessionStorage.setItem(${JSON.stringify(adminInviteTokenStorageKey)}, token);
		history.replaceState(null, "", location.pathname + location.search);
	} catch {}
})();`;

export function readAdminInviteToken() {
	try {
		return (
			window.sessionStorage.getItem(adminInviteTokenStorageKey) ?? undefined
		);
	} catch {
		return undefined;
	}
}

export function clearAdminInviteToken() {
	try {
		window.sessionStorage.removeItem(adminInviteTokenStorageKey);
	} catch {}
}

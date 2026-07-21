import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
	window.addEventListener("online", listener);
	window.addEventListener("offline", listener);
	return () => {
		window.removeEventListener("online", listener);
		window.removeEventListener("offline", listener);
	};
}

function getSnapshot() {
	return navigator.onLine;
}

export function useOnlineStatus() {
	return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

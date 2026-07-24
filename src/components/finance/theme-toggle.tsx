import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { DropdownMenuItem } from "#/components/ui/dropdown-menu.tsx";

type Theme = "light" | "dark" | "system";

const storageKey = "din-din-theme";
const themeLabels = {
	light: "Claro",
	dark: "Escuro",
	system: "Sistema",
} as const;

function resolveTheme(theme: Theme) {
	return theme === "system"
		? window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light"
		: theme;
}

function applyTheme(theme: Theme) {
	document.documentElement.classList.toggle(
		"dark",
		resolveTheme(theme) === "dark",
	);
}

function useThemeSelection() {
	const [theme, setTheme] = useState<Theme>("system");

	useEffect(() => {
		const saved = window.localStorage.getItem(storageKey) as Theme | null;
		const initial =
			saved === "light" || saved === "dark" || saved === "system"
				? saved
				: "system";
		setTheme(initial);
		applyTheme(initial);
	}, []);

	useEffect(() => {
		if (theme !== "system") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const syncSystemTheme = () => applyTheme("system");
		media.addEventListener("change", syncSystemTheme);
		return () => media.removeEventListener("change", syncSystemTheme);
	}, [theme]);

	function updateTheme(nextTheme: Theme) {
		setTheme(nextTheme);
		window.localStorage.setItem(storageKey, nextTheme);
		applyTheme(nextTheme);
	}

	return { theme, updateTheme };
}

export function ThemeToggle() {
	const { theme, updateTheme } = useThemeSelection();
	const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;
	const nextTheme =
		theme === "system" ? "light" : theme === "light" ? "dark" : "system";

	return (
		<DropdownMenuItem onClick={() => updateTheme(nextTheme)}>
			<Icon /> Tema: {themeLabels[theme]}
		</DropdownMenuItem>
	);
}

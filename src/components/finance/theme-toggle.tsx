import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button.tsx";

type Theme = "light" | "dark" | "system";

const storageKey = "din-din-theme";

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

export function ThemeToggle() {
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

	const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;
	const nextTheme: Theme =
		theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

	return (
		<Button
			aria-label={`Tema atual: ${theme}. Alterar tema.`}
			onClick={() => updateTheme(nextTheme)}
			size="icon-sm"
			title={`Tema: ${theme}`}
			variant="ghost"
		>
			<Icon />
		</Button>
	);
}

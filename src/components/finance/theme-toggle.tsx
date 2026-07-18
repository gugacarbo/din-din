import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";

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
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label={`Tema atual: ${theme}. Escolher tema.`}
					size="icon-sm"
					title={`Tema: ${theme}`}
					variant="ghost"
				>
					<Icon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>Tema</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					onValueChange={(value) => updateTheme(value as Theme)}
					value={theme}
				>
					<DropdownMenuRadioItem value="light">
						<Sun /> Claro
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark">
						<Moon /> Escuro
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="system">
						<Laptop /> Sistema
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

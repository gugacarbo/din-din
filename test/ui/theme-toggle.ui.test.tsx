import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "#/components/finance/theme-toggle.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
} from "#/components/ui/dropdown-menu.tsx";

function renderThemeToggle() {
	return render(
		<DropdownMenu open>
			<DropdownMenuContent>
				<ThemeToggle />
			</DropdownMenuContent>
		</DropdownMenu>,
	);
}

describe("ThemeToggle", () => {
	afterEach(() => {
		document.documentElement.classList.remove("dark");
		window.localStorage.removeItem("din-din-theme");
	});

	it("applies and persists the selected theme when the menu item is clicked", async () => {
		const user = userEvent.setup();
		renderThemeToggle();

		await user.click(await screen.findByRole("menuitem", { name: "Tema: Sistema" }));

		expect(window.localStorage.getItem("din-din-theme")).toBe("light");
		expect(document.documentElement).not.toHaveClass("dark");
	});
});

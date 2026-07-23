import {
	CircleCheck,
	Info,
	Loader2,
	OctagonX,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function currentTheme(): "dark" | "light" {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function Toaster(props: ToasterProps) {
	const [theme, setTheme] = useState<"dark" | "light">("light");

	useEffect(() => {
		const syncTheme = () => setTheme(currentTheme());
		syncTheme();
		const observer = new MutationObserver(syncTheme);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);

	return (
		<Sonner
			className="toaster group"
			closeButton
			icons={{
				error: <OctagonX className="size-4" />,
				info: <Info className="size-4" />,
				loading: <Loader2 className="size-4 animate-spin" />,
				success: <CircleCheck className="size-4" />,
				warning: <TriangleAlert className="size-4" />,
			}}
			position="bottom-right"
			style={
				{
					"--border-radius": "var(--radius)",
					"--normal-bg": "var(--popover)",
					"--normal-border": "var(--border)",
					"--normal-text": "var(--popover-foreground)",
				} as React.CSSProperties
			}
			theme={theme}
			toastOptions={{ classNames: { toast: "cn-toast" } }}
			{...props}
		/>
	);
}

export { Toaster };

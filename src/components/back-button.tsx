import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";

function BackButton({
	children = "Voltar",
	disabled,
	type = "button",
	...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & { children?: ReactNode }) {
	const canGoBack = useCanGoBack();
	const router = useRouter();

	return (
		<Button
			disabled={disabled || !canGoBack}
			onClick={() => router.history.back()}
			type={type}
			variant="outline"
			{...props}
		>
			<ArrowLeft />
			{children}
		</Button>
	);
}

export { BackButton };

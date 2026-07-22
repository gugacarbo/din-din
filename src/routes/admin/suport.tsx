import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportPage } from "#/components/admin-support-page.tsx";

export const Route = createFileRoute("/admin/suport")({
	component: AdminSupportPage,
});

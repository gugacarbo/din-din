import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportPage } from "#/components/admin-support-page.tsx";
import { requireAdminSession } from "#/lib/route-session.ts";

export const Route = createFileRoute("/admin/suport")({
	beforeLoad: ({ context }) => requireAdminSession(context.queryClient),
	component: AdminSupportPage,
});

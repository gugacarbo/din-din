import { Button } from "#/components/ui/button.tsx";

type GitHubIssueReferenceProps = {
	issueNumber: number | null;
	issueUrl: string | null;
};

function isSafeGitHubIssueUrl(issueNumber: number, issueUrl: string) {
	try {
		const url = new URL(issueUrl);
		return (
			url.protocol === "https:" &&
			url.hostname === "github.com" &&
			url.username === "" &&
			url.password === "" &&
			url.search === "" &&
			url.hash === "" &&
			new RegExp(`^/[^/]+/[^/]+/issues/${issueNumber}$`).test(url.pathname)
		);
	} catch {
		return false;
	}
}

export function GitHubIssueReference({
	issueNumber,
	issueUrl,
}: GitHubIssueReferenceProps) {
	if (
		typeof issueNumber !== "number" ||
		!Number.isSafeInteger(issueNumber) ||
		issueNumber <= 0 ||
		!issueUrl ||
		!isSafeGitHubIssueUrl(issueNumber, issueUrl)
	)
		return null;

	return (
		<Button
			asChild
			className="h-auto p-0 text-foreground hover:text-foreground"
			variant="link"
		>
			<a href={issueUrl} rel="noreferrer" target="_blank">
				Issue #{issueNumber}
			</a>
		</Button>
	);
}

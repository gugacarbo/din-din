import type { SVGProps } from "react";

type CatIconProps = SVGProps<SVGSVGElement>;

export function CatFace(props: CatIconProps) {
	return (
		<svg
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			{...props}
		>
			<title>Rosto de gato</title>
			<path d="m5 9-1-5 5 2 3-2 3 2 5-2-1 5v5a7 7 0 0 1-14 0Z" />
			<path d="M9 13h.01M15 13h.01M10 17h4M12 14v3" />
			<path d="M4 15h4M16 15h4" />
		</svg>
	);
}

export function CatSitting(props: CatIconProps) {
	return (
		<svg
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			{...props}
		>
			<title>Gato sentado</title>
			<path d="m7 8-1-4 4 2 2-2 2 2 4-2-1 4v3a5 5 0 0 1-10 0Z" />
			<path d="M9 10h.01M15 10h.01M10 13h4" />
			<path d="M9 16v4h6v-4" />
			<path d="M15 20h3a3 3 0 0 0 0-6h-2" />
		</svg>
	);
}

export function CatPlay(props: CatIconProps) {
	return (
		<svg
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			{...props}
		>
			<title>Gato brincando</title>
			<path d="m4 9-1-5 5 2 3-2 3 2 5-2-1 5v4a7 7 0 0 1-14 0Z" />
			<path d="M9 12h.01M15 12h.01M10 15h4" />
			<path d="m16 18 2-2" />
			<circle cx="20" cy="20" r="2" />
		</svg>
	);
}

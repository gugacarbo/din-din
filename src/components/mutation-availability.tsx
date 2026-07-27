import { createContext, type ReactNode, useContext } from "react";

type MutationAvailability = {
	available: boolean;
};

const MutationAvailabilityContext = createContext<MutationAvailability>({
	available: true,
});

export function MutationAvailabilityProvider({
	available,
	children,
}: MutationAvailability & { children: ReactNode }) {
	return (
		<MutationAvailabilityContext.Provider value={{ available }}>
			{children}
		</MutationAvailabilityContext.Provider>
	);
}

export function useMutationAvailability() {
	return useContext(MutationAvailabilityContext);
}

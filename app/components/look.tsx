import React, { createContext, useContext } from "react";
import { AuraLook, DEFAULT_LOOK } from "../lib/faces";

// How this person has dressed Aura up. Provided once at the root so every Mark matches.
const LookContext = createContext<AuraLook>(DEFAULT_LOOK);
export const LookProvider = ({ value, children }: { value: AuraLook; children: React.ReactNode }) => <LookContext.Provider value={value}>{children}</LookContext.Provider>;
export const useLook = () => useContext(LookContext);

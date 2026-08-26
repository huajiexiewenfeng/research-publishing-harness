import type { PublicationBundlePhase } from './publication-bundle-types.js';
export declare function transitionPublicationBundle(from: PublicationBundlePhase, to: PublicationBundlePhase): PublicationBundlePhase;
export declare function isTerminalPublicationBundlePhase(phase: PublicationBundlePhase): boolean;

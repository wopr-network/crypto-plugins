import type { IChainPlugin } from "@wopr-network/platform-core/crypto-plugin";

export const solanaPlugin: IChainPlugin = {
	pluginId: "solana",
	supportedCurve: "ed25519",
	encoders: {},
	createWatcher: () => {
		throw new Error("Not implemented");
	},
	createSweeper: () => {
		throw new Error("Not implemented");
	},
	version: 1,
};

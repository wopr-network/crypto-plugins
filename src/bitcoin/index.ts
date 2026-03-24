import type { IChainPlugin } from "@wopr-network/platform-core/crypto-plugin";

export const bitcoinPlugin: IChainPlugin = {
	pluginId: "bitcoin",
	supportedCurve: "secp256k1",
	encoders: {},
	createWatcher: () => {
		throw new Error("Not implemented");
	},
	createSweeper: () => {
		throw new Error("Not implemented");
	},
	version: 1,
};

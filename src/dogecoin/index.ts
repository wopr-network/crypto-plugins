import type { IChainPlugin } from "@wopr-network/platform-core/crypto-plugin";

export const dogecoinPlugin: IChainPlugin = {
	pluginId: "dogecoin",
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

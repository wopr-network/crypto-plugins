export { createBitcoindRpc, createRpcFromOpts, parseRpcUrl } from "./rpc.js";
export type {
	DescriptorInfo,
	GetTransactionResponse,
	ImportDescriptorResult,
	ReceivedByAddress,
	RpcCall,
	TxDetail,
	UtxoNodeConfig,
} from "./types.js";
export { UtxoWatcher, createUtxoWatcher } from "./watcher.js";
export type { UtxoWatcherConfig } from "./watcher.js";

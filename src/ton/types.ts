/** TON HTTP API call function signature (TON Center v2 style). */
export type TonApiCall = (method: string, params: Record<string, string>) => Promise<unknown>;

/** TON transaction from getTransactions API. */
export interface TonTransaction {
	utime: number;
	hash: string;
	lt: string;
	fee: string;
	in_msg?: TonMessage;
	out_msgs?: TonMessage[];
}

/** TON message (incoming or outgoing). */
export interface TonMessage {
	source: string;
	destination: string;
	value: string;
	message?: string;
	msg_data?: {
		"@type": string;
		body?: string;
		text?: string;
	};
}

/** TON account state from getAddressInformation. */
export interface TonAccountState {
	balance: string;
	state: "active" | "uninitialized" | "frozen";
	last_transaction_id?: {
		lt: string;
		hash: string;
	};
}

/** Jetton (TON token) transfer event. */
export interface JettonTransfer {
	sender: string;
	destination: string;
	amount: string;
	jettonMaster: string;
	transactionHash: string;
	lt: string;
	utime: number;
}

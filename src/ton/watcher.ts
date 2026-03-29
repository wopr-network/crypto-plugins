import type {
	IChainWatcher,
	IPriceOracle,
	IWatcherCursorStore,
	PaymentEvent,
	WatcherOpts,
} from "@wopr-network/platform-crypto-server/plugin";
import type { TonApiCall, TonTransaction } from "./types.js";

/** TON has 9 decimals (nanoton). */
const TON_DECIMALS = 9;
const MICROS_PER_CENT = 10_000n;

/**
 * Convert native TON amount (nanoton) to USD cents using oracle price in microdollars.
 */
function nativeToCents(nanoton: bigint, priceMicros: number, decimals: number): number {
	if (nanoton < 0n) throw new Error("nanoton must be non-negative");
	if (!Number.isInteger(priceMicros) || priceMicros <= 0) {
		throw new Error(`priceMicros must be a positive integer, got ${priceMicros}`);
	}
	return Number((nanoton * BigInt(priceMicros)) / (MICROS_PER_CENT * 10n ** BigInt(decimals)));
}

/**
 * Create a TON Center HTTP API v2 caller.
 *
 * TON Center uses REST-style endpoints, not JSON-RPC.
 * Endpoint: https://toncenter.com/api/v2/{method}?{params}
 */
export function createTonApiCaller(baseUrl: string, apiKey?: string): TonApiCall {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (apiKey) headers["X-API-Key"] = apiKey;

	return async (method: string, params: Record<string, string>): Promise<unknown> => {
		const qs = new URLSearchParams(params).toString();
		const url = `${baseUrl}/${method}${qs ? `?${qs}` : ""}`;
		const res = await fetch(url, { headers });
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`TON API ${method} failed: ${res.status} ${body.slice(0, 200)}`);
		}
		const data = (await res.json()) as { ok: boolean; result?: unknown; error?: string };
		if (!data.ok) throw new Error(`TON API ${method} error: ${data.error ?? "unknown"}`);
		return data.result;
	};
}

/**
 * TON chain watcher.
 *
 * Monitors watched addresses for incoming TON transfers.
 * Uses TON Center API v2 (getTransactions) to poll for new transactions.
 * Cursor is the logical time (lt) of the last processed transaction, stored as a number.
 *
 * For native TON: detects incoming messages with value > 0.
 * For Jetton (USDT etc.): would need to parse transfer notifications — deferred.
 */
export class TonWatcher implements IChainWatcher {
	private _cursor = 0;
	private _stopped = false;
	private readonly chain: string;
	private readonly token: string;
	private readonly api: TonApiCall;
	private readonly confirmationsRequired: number;
	private readonly decimals: number;
	private readonly cursorStore: IWatcherCursorStore;
	private readonly oracle: IPriceOracle;
	private readonly watcherId: string;
	private _watchedAddresses: string[] = [];

	constructor(opts: WatcherOpts) {
		this.chain = opts.chain;
		this.token = opts.token;
		this.decimals = opts.decimals ?? TON_DECIMALS;
		this.confirmationsRequired = opts.confirmations ?? 1;
		this.cursorStore = opts.cursorStore;
		this.oracle = opts.oracle;
		this.watcherId = `ton:${this.chain}:${this.token}`;

		const rpcUrl = opts.rpcUrl || "https://toncenter.com/api/v2";
		this.api = createTonApiCaller(rpcUrl, opts.rpcHeaders?.["X-API-Key"]);
	}

	async init(): Promise<void> {
		const saved = await this.cursorStore.get(this.watcherId);
		if (saved !== null) this._cursor = saved;
	}

	setWatchedAddresses(addresses: string[]): void {
		this._watchedAddresses = addresses;
	}

	getCursor(): number {
		return this._cursor;
	}

	stop(): void {
		this._stopped = true;
	}

	/**
	 * Poll for TON transfers to watched addresses.
	 *
	 * For each watched address:
	 *   1. Call getTransactions to find recent transactions
	 *   2. Filter for incoming messages with value > 0
	 *   3. Emit payment events for new transfers
	 *
	 * Cursor is the highest logical time (lt) seen, persisted across restarts.
	 */
	async poll(): Promise<PaymentEvent[]> {
		if (this._stopped || this._watchedAddresses.length === 0) return [];

		const events: PaymentEvent[] = [];

		for (const address of this._watchedAddresses) {
			try {
				const txs = await this.getRecentTransactions(address);
				if (!txs.length) continue;

				for (const tx of txs) {
					const lt = Number(tx.lt);
					// Skip if we've already processed this
					if (lt <= this._cursor) continue;

					// Check for incoming message with value
					if (tx.in_msg && tx.in_msg.destination === address && BigInt(tx.in_msg.value) > 0n) {
						const rawAmount = BigInt(tx.in_msg.value);
						let amountUsdCents = 0;
						try {
							const { priceMicros } = await this.oracle.getPrice(this.token);
							if (priceMicros > 0) {
								amountUsdCents = nativeToCents(rawAmount, priceMicros, this.decimals);
							}
						} catch {
							/* oracle failure is non-fatal */
						}

						events.push({
							chain: this.chain,
							token: this.token,
							to: address,
							from: tx.in_msg.source || "unknown",
							rawAmount: rawAmount.toString(),
							amountUsdCents,
							txHash: tx.hash,
							blockNumber: lt,
							confirmations: this.confirmationsRequired, // TON finalizes in ~5s
							confirmationsRequired: this.confirmationsRequired,
						});
					}
				}

				// Advance cursor to highest lt
				const maxLt = txs.reduce((max, tx) => Math.max(max, Number(tx.lt)), this._cursor);
				if (maxLt > this._cursor) {
					this._cursor = maxLt;
					await this.cursorStore.save(this.watcherId, this._cursor);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[ton-watcher] Error polling ${address}: ${msg}`);
			}
		}

		return events;
	}

	/**
	 * Fetch recent transactions for an address via TON Center API.
	 */
	private async getRecentTransactions(address: string): Promise<TonTransaction[]> {
		const result = await this.api("getTransactions", {
			address,
			limit: "20",
			archival: "true",
		});
		return (result as TonTransaction[]) ?? [];
	}
}

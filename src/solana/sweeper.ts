import type {
	DepositInfo,
	ISweepStrategy,
	KeyPair,
	SweeperOpts,
	SweepResult,
} from "@wopr-network/platform-core/crypto-plugin";
import type { SolanaRpcCall } from "./types.js";
import { createSolanaRpcCaller } from "./watcher.js";

/** Transaction fee estimate (in lamports). */
const TX_FEE = 5_000n;

/**
 * Solana sweep strategy.
 *
 * Scans deposit addresses for SOL balances and SPL token balances,
 * then creates transfer transactions to sweep funds to the treasury.
 */
export class SolanaSweeper implements ISweepStrategy {
	private readonly rpc: SolanaRpcCall;
	private readonly token: string;
	private readonly chain: string;
	private readonly contractAddress?: string;
	private readonly decimals: number;

	constructor(opts: SweeperOpts) {
		this.rpc = createSolanaRpcCaller(opts.rpcUrl, opts.rpcHeaders);
		this.token = opts.token;
		this.chain = opts.chain;
		this.contractAddress = opts.contractAddress;
		this.decimals = opts.decimals;
	}

	/**
	 * Scan deposit addresses for balances.
	 *
	 * For each key:
	 *   - Check native SOL balance via getBalance
	 *   - Check SPL token balances via getTokenAccountsByOwner
	 */
	async scan(keys: KeyPair[], _treasury: string): Promise<DepositInfo[]> {
		const results: DepositInfo[] = [];

		for (const key of keys) {
			const balance = (await this.rpc("getBalance", [key.address])) as { value: number };
			const nativeBalance = BigInt(balance.value);

			const tokenBalances: Array<{ token: string; balance: bigint; decimals: number }> = [];

			if (this.contractAddress) {
				const tokenAccounts = (await this.rpc("getTokenAccountsByOwner", [
					key.address,
					{ mint: this.contractAddress },
					{ encoding: "jsonParsed" },
				])) as {
					value: Array<{
						account: {
							data: {
								parsed: {
									info: {
										tokenAmount: { amount: string; decimals: number };
										mint: string;
									};
								};
							};
						};
					}>;
				};

				for (const ta of tokenAccounts.value) {
					const info = ta.account.data.parsed.info;
					const bal = BigInt(info.tokenAmount.amount);
					if (bal > 0n) {
						tokenBalances.push({
							token: info.mint,
							balance: bal,
							decimals: info.tokenAmount.decimals,
						});
					}
				}
			}

			if (nativeBalance > 0n || tokenBalances.length > 0) {
				results.push({
					index: key.index,
					address: key.address,
					nativeBalance,
					tokenBalances,
				});
			}
		}

		return results;
	}

	/**
	 * Sweep funds from deposit addresses to treasury.
	 *
	 * For native SOL: transfers balance minus fee.
	 * For SPL tokens: transfers full token balance using token transfer instruction.
	 *
	 * In dry-run mode, returns what would be swept without broadcasting.
	 */
	async sweep(keys: KeyPair[], treasury: string, dryRun: boolean): Promise<SweepResult[]> {
		const deposits = await this.scan(keys, treasury);
		const results: SweepResult[] = [];

		for (const deposit of deposits) {
			const key = keys.find((k) => k.index === deposit.index);
			if (!key) continue;

			// Sweep SPL tokens first
			for (const tb of deposit.tokenBalances) {
				if (dryRun) {
					results.push({
						index: deposit.index,
						address: deposit.address,
						token: tb.token,
						amount: tb.balance.toString(),
						txHash: "dry-run",
					});
					continue;
				}

				// In production, this would build and sign an SPL token transfer transaction
				// using @solana/web3.js. For now, placeholder for the transaction submission.
				const txHash = await this.submitSplTransfer(key, treasury, tb.token, tb.balance);
				results.push({
					index: deposit.index,
					address: deposit.address,
					token: tb.token,
					amount: tb.balance.toString(),
					txHash,
				});
			}

			// Sweep native SOL (leave enough for rent + fee if token accounts exist)
			const sweepableNative = deposit.nativeBalance - TX_FEE;
			if (sweepableNative > 0n) {
				if (dryRun) {
					results.push({
						index: deposit.index,
						address: deposit.address,
						token: "SOL",
						amount: sweepableNative.toString(),
						txHash: "dry-run",
					});
					continue;
				}

				const txHash = await this.submitSolTransfer(key, treasury, sweepableNative);
				results.push({
					index: deposit.index,
					address: deposit.address,
					token: "SOL",
					amount: sweepableNative.toString(),
					txHash,
				});
			}
		}

		return results;
	}

	/**
	 * Submit a native SOL transfer.
	 *
	 * Builds a SystemProgram.transfer instruction, signs with the deposit keypair,
	 * and submits via sendTransaction.
	 */
	private async submitSolTransfer(key: KeyPair, treasury: string, lamports: bigint): Promise<string> {
		// Get recent blockhash
		const blockhashResult = (await this.rpc("getLatestBlockhash", [{ commitment: "finalized" }])) as {
			value: { blockhash: string; lastValidBlockHeight: number };
		};

		// In production, build + sign the transaction using @solana/web3.js or manual serialization.
		// For Phase 1, we use a simplified approach:
		throw new Error(
			`SOL transfer not yet implemented — would send ${lamports} lamports from ${key.address} to ${treasury} with blockhash ${blockhashResult.value.blockhash}`,
		);
	}

	/**
	 * Submit an SPL token transfer.
	 *
	 * Builds a TokenProgram.transfer instruction for the given mint,
	 * signs with the deposit keypair, and submits via sendTransaction.
	 */
	private async submitSplTransfer(key: KeyPair, treasury: string, mint: string, amount: bigint): Promise<string> {
		throw new Error(
			`SPL transfer not yet implemented — would send ${amount} of ${mint} from ${key.address} to ${treasury}`,
		);
	}
}

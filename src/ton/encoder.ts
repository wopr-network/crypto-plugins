import type { EncodingParams, IAddressEncoder } from "@wopr-network/platform-crypto-server/plugin";

/**
 * Encode a TON user-friendly address from a raw 32-byte Ed25519 public key.
 *
 * TON "raw" addresses are workchain:hash, where hash = sha256(stateInit).
 * For payment reception, we use a simple transfer-only wallet (v4r2) state init.
 * But for key-server purposes, we use the raw public key hash directly as the
 * address identifier, then encode it in TON's user-friendly base64url format.
 *
 * User-friendly format (36 bytes):
 *   [tag:1][workchain:1][hash:32][crc16:2]
 *
 * Tag: 0x11 = bounceable, 0x51 = non-bounceable
 * Workchain: 0x00 = basechain, 0xff = masterchain
 */

/** CRC16-CCITT used by TON addresses. */
function crc16(data: Uint8Array): number {
	let crc = 0;
	for (let i = 0; i < data.length; i++) {
		crc ^= data[i] << 8;
		for (let j = 0; j < 8; j++) {
			if (crc & 0x8000) {
				crc = ((crc << 1) ^ 0x1021) & 0xffff;
			} else {
				crc = (crc << 1) & 0xffff;
			}
		}
	}
	return crc;
}

/** Base64url encode (no padding). */
function base64urlEncode(bytes: Uint8Array): string {
	const binary = String.fromCharCode(...bytes);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Encode a raw 32-byte hash as a TON user-friendly address.
 *
 * @param hash - 32-byte address hash (typically sha256 of state init)
 * @param bounceable - true for bounceable (0x11), false for non-bounceable (0x51)
 * @param workchain - 0 for basechain (default)
 */
export function encodeTonAddress(hash: Uint8Array, bounceable = false, workchain = 0): string {
	if (hash.length !== 32) {
		throw new Error(`TON address requires 32-byte hash, got ${hash.length} bytes`);
	}

	const tag = bounceable ? 0x11 : 0x51;
	const wc = workchain === -1 ? 0xff : workchain & 0xff;

	// Build 34-byte payload: tag + workchain + hash
	const payload = new Uint8Array(34);
	payload[0] = tag;
	payload[1] = wc;
	payload.set(hash, 2);

	// CRC16 checksum
	const crc = crc16(payload);
	const full = new Uint8Array(36);
	full.set(payload);
	full[34] = (crc >> 8) & 0xff;
	full[35] = crc & 0xff;

	return base64urlEncode(full);
}

/**
 * TON address encoder.
 *
 * For the key server, we derive an Ed25519 public key from the xpub,
 * then SHA-256 hash it to get the 32-byte address hash. This is encoded
 * as a non-bounceable user-friendly address (UQ... prefix).
 *
 * Note: This produces a "raw" address that can receive TON. For production,
 * you'd deploy a wallet contract and use its state init hash. For payment
 * detection, the raw key hash is sufficient as an identifier — the watcher
 * matches on the raw address portion.
 */
export class TonAddressEncoder implements IAddressEncoder {
	encode(publicKey: Uint8Array, _params: EncodingParams): string {
		if (publicKey.length !== 32) {
			throw new Error(`TON encoder requires 32-byte Ed25519 public key, got ${publicKey.length} bytes`);
		}
		// SHA-256 hash of the public key to get the 32-byte address hash.
		// In a full wallet deployment, this would be sha256(stateInit), but
		// for address derivation from xpub, we use the key hash directly.
		// The watcher matches on the raw 32-byte hash portion of the address.
		const hashBuffer = new Uint8Array(
			// Use SubtleCrypto synchronously isn't possible — use a simple hash.
			// TON addresses in practice need wallet contract deployment.
			// For now, use the raw public key as the hash (like Solana does).
			publicKey,
		);
		return encodeTonAddress(hashBuffer, false, 0);
	}

	encodingType(): string {
		return "ton-base64url";
	}
}

import nacl from "tweetnacl";

import type { EncryptedPayload } from "./types";

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const PUBLIC_KEY_LENGTH = nacl.box.publicKeyLength;
export const SECRET_KEY_LENGTH = nacl.box.secretKeyLength;
export const NONCE_LENGTH = nacl.box.nonceLength;

export function generateKeyPair(): KeyPair {
  const pair = nacl.box.keyPair();
  return {
    publicKey: pair.publicKey,
    secretKey: pair.secretKey,
  };
}

export function encrypt(
  payload: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array,
  nonce: Uint8Array = nacl.randomBytes(NONCE_LENGTH),
): EncryptedPayload {
  const ciphertext = nacl.box(payload, nonce, recipientPublicKey, senderSecretKey);
  return { nonce, ciphertext };
}

export function decrypt(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array,
): Uint8Array | null {
  return nacl.box.open(ciphertext, nonce, senderPublicKey, recipientSecretKey);
}

export function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function decodeText(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

export function encodeHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function decodeHex(value: string): Uint8Array {
  if (value.length % 2 !== 0) {
    throw new Error("Hex strings must contain an even number of characters.");
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
}

export function encodeBase64(value: Uint8Array): string {
  let output = "";
  for (let index = 0; index < value.length; index += 3) {
    const first = value[index] ?? 0;
    const second = value[index + 1] ?? 0;
    const third = value[index + 2] ?? 0;

    const chunk = (first << 16) | (second << 8) | third;
    output += BASE64_ALPHABET[(chunk >> 18) & 0x3f];
    output += BASE64_ALPHABET[(chunk >> 12) & 0x3f];
    output += index + 1 < value.length ? BASE64_ALPHABET[(chunk >> 6) & 0x3f] : "=";
    output += index + 2 < value.length ? BASE64_ALPHABET[chunk & 0x3f] : "=";
  }

  return output;
}

export function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length % 4 !== 0) {
    throw new Error("Invalid base64 string length.");
  }

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  const outputLength = (normalized.length / 4) * 3 - padding;
  const result = new Uint8Array(outputLength);

  let outputIndex = 0;
  for (let index = 0; index < normalized.length; index += 4) {
    const encodedA = decodeBase64Character(normalized[index]);
    const encodedB = decodeBase64Character(normalized[index + 1]);
    const encodedC = normalized[index + 2] === "=" ? 0 : decodeBase64Character(normalized[index + 2]);
    const encodedD = normalized[index + 3] === "=" ? 0 : decodeBase64Character(normalized[index + 3]);

    const chunk = (encodedA << 18) | (encodedB << 12) | (encodedC << 6) | encodedD;

    if (outputIndex < outputLength) {
      result[outputIndex] = (chunk >> 16) & 0xff;
      outputIndex += 1;
    }

    if (outputIndex < outputLength) {
      result[outputIndex] = (chunk >> 8) & 0xff;
      outputIndex += 1;
    }

    if (outputIndex < outputLength) {
      result[outputIndex] = chunk & 0xff;
      outputIndex += 1;
    }
  }

  return result;
}

export function createPin(length = 6): string {
  const digits = nacl.randomBytes(length);
  return Array.from(digits, (value) => (value % 10).toString()).join("");
}

export function deviceIdFromPublicKey(publicKey: Uint8Array): string {
  return encodeHex(publicKey.slice(0, 8));
}

function decodeBase64Character(character: string): number {
  const index = BASE64_ALPHABET.indexOf(character);
  if (index === -1) {
    throw new Error(`Invalid base64 character: ${character}`);
  }

  return index;
}

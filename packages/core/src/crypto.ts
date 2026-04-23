import nacl from "tweetnacl";

import type { EncryptedPayload } from "./types";

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface BufferLike {
  from(input: string | Uint8Array, encoding?: string): { toString(encoding: string): string };
}

const globalWithBuffer = globalThis as typeof globalThis & { Buffer?: BufferLike };

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
  return textEncoder.encode(value);
}

export function decodeText(value: Uint8Array): string {
  return textDecoder.decode(value);
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
  const bufferApi = globalWithBuffer.Buffer;
  if (bufferApi) {
    return bufferApi.from(value).toString("base64");
  }

  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const bufferApi = globalWithBuffer.Buffer;
  if (bufferApi) {
    const encoded = bufferApi.from(value, "base64").toString("binary");
    const result = new Uint8Array(encoded.length);
    for (let index = 0; index < encoded.length; index += 1) {
      result[index] = encoded.charCodeAt(index);
    }
    return result;
  }

  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index);
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

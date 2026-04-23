declare module "text-encoding" {
  export class TextEncoder {
    encode(input?: string): Uint8Array;
  }

  export class TextDecoder {
    decode(input?: ArrayBuffer | ArrayBufferView): string;
  }
}

import "react-native-get-random-values";
import { TextDecoder, TextEncoder } from "text-encoding";

type GlobalWithEncoding = typeof globalThis & {
  TextDecoder?: typeof globalThis.TextDecoder;
  TextEncoder?: typeof globalThis.TextEncoder;
};

const runtimeGlobal = globalThis as GlobalWithEncoding;

if (typeof runtimeGlobal.TextEncoder === "undefined") {
  runtimeGlobal.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
}

if (typeof runtimeGlobal.TextDecoder === "undefined") {
  runtimeGlobal.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}

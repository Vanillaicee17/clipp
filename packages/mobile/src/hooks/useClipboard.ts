import { useEffect, useState } from "react";
import * as Clipboard from "expo-clipboard";

interface UseClipboardResult {
  clipboardText: string;
  setClipboardText: (text: string) => Promise<void>;
}

export function useClipboard(): UseClipboardResult {
  const [clipboardText, setClipboardTextState] = useState("");

  useEffect(() => {
    let mounted = true;

    const syncClipboard = async () => {
      const currentText = await Clipboard.getStringAsync();
      if (mounted) {
        setClipboardTextState(currentText);
      }
    };

    void syncClipboard();

    const interval = setInterval(() => {
      void syncClipboard();
    }, 500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const setClipboardText = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setClipboardTextState(text);
  };

  return {
    clipboardText,
    setClipboardText,
  };
}

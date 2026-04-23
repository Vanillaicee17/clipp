import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface UseClipboardResult {
  clipboardText: string;
  setClipboardText: (text: string) => Promise<void>;
}

export function useClipboard(): UseClipboardResult {
  const [clipboardText, setClipboardTextState] = useState("");

  useEffect(() => {
    let disposed = false;

    const loadInitialText = async () => {
      const currentText = await invoke<string>("get_clipboard");
      if (!disposed) {
        setClipboardTextState(currentText);
      }
    };

    const removeListenerPromise = listen<string>("clipboard-changed", (event) => {
      setClipboardTextState(event.payload);
    });

    void loadInitialText();

    return () => {
      disposed = true;
      void removeListenerPromise.then((removeListener) => removeListener());
    };
  }, []);

  const setClipboardText = async (text: string) => {
    await invoke("set_clipboard", { text });
    setClipboardTextState(text);
  };

  return {
    clipboardText,
    setClipboardText,
  };
}

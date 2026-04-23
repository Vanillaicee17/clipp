use arboard::Clipboard;
use std::{
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};

pub fn read_clipboard_text() -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard.get_text().map_err(|error| error.to_string())
}

pub fn write_clipboard_text(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_text(text.to_owned())
        .map_err(|error| error.to_string())
}

pub fn spawn_clipboard_watcher(app_handle: AppHandle) {
    thread::spawn(move || {
        let mut last_seen = read_clipboard_text().unwrap_or_default();

        loop {
            match read_clipboard_text() {
                Ok(current_text) if current_text != last_seen => {
                    last_seen = current_text.clone();
                    if let Err(error) = app_handle.emit("clipboard-changed", current_text) {
                        eprintln!("failed to emit clipboard update: {error}");
                    }
                }
                Ok(_) => {}
                Err(error) => {
                    eprintln!("failed to read clipboard: {error}");
                }
            }

            thread::sleep(Duration::from_millis(500));
        }
    });
}

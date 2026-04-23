mod clipboard;
mod commands;

use clipboard::spawn_clipboard_watcher;
use commands::{get_clipboard, get_pairing_relay_url, set_clipboard};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            spawn_clipboard_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_clipboard,
            get_pairing_relay_url,
            set_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running clipp desktop");
}

use crate::clipboard::{read_clipboard_text, write_clipboard_text};

#[tauri::command]
pub fn get_clipboard() -> Result<String, String> {
    read_clipboard_text()
}

#[tauri::command]
pub fn set_clipboard(text: String) -> Result<(), String> {
    write_clipboard_text(&text)
}

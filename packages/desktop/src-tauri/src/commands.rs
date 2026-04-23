use std::net::UdpSocket;

use crate::clipboard::{read_clipboard_text, write_clipboard_text};

#[tauri::command]
pub fn get_clipboard() -> Result<String, String> {
    read_clipboard_text()
}

#[tauri::command]
pub fn set_clipboard(text: String) -> Result<(), String> {
    write_clipboard_text(&text)
}

#[tauri::command]
pub fn get_pairing_relay_url() -> Result<String, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
    socket
        .connect("8.8.8.8:80")
        .map_err(|error| format!("Failed to determine LAN address: {error}"))?;

    let local_address = socket
        .local_addr()
        .map_err(|error| format!("Failed to inspect local address: {error}"))?;

    Ok(format!("ws://{}:8787", local_address.ip()))
}

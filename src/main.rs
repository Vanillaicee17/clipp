use std::error::Error;
use copypasta::{ClipboardContext, ClipboardProvider};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::time::{sleep, Duration};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use rand::Rng; // Add this for generating random nonces

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let android_ip = "192.168.184.53"; // Make sure this matches your server's IP
    let port = 5000;
    
    println!("Attempting to connect to {}:{}", android_ip, port);
    
    // Establish a regular TCP connection
    let mut stream = TcpStream::connect(format!("{}:{}", android_ip, port))
        .await
        .map_err(|e| {
            println!("TCP connection failed: {:?}", e);
            e
        })?;
    println!("TCP connection successful");

    let mut ctx = ClipboardContext::new().unwrap();
    let mut last_content = String::new();
    let my_key: [u8; 32] =[0xf7, 0x12, 0xf7, 0x8e, 0xb3, 0x01, 0x76, 0x16, 0x19, 0x33, 0x32, 0x7c, 0xcd, 0xa7, 0xdc, 0xed, 0x88, 0xcb, 0xc4, 0x24, 0x8a, 0xaf, 0x5d, 0x00, 0xcc, 0x52, 0xc6, 0xbd, 0x5f, 0xea, 0xfe, 0x1e]; // Replace with your actual key
    
    loop {
        sleep(Duration::from_secs(1)).await;
        let current_content = ctx.get_contents().unwrap_or_default();
        if current_content != last_content {
            let encrypted_text = encrypt(current_content.as_bytes(), &my_key);
            stream.write_all(&encrypted_text).await?; // Send raw bytes, not as_bytes()
            println!("New message sent: {}", current_content);
            last_content = current_content;
        }
    }
}

fn encrypt(plaintext: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .expect("Invalid key length");
    
    let mut rng = rand::thread_rng();
    let mut nonce = [0u8; 12];
    rng.fill(&mut nonce); // Generate a random nonce for each encryption
    let nonce = Nonce::from_slice(&nonce);
    
    let ciphertext = cipher.encrypt(nonce, plaintext)
        .expect("encryption failure!");

    [nonce.as_slice(), &ciphertext].concat()
}

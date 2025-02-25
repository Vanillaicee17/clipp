use std::error::Error;
use copypasta::{ClipboardContext, ClipboardProvider};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::time::{sleep, Duration};

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
    
    loop {
        sleep(Duration::from_secs(1)).await;
        let current_content = ctx.get_contents().unwrap_or_default();
        if current_content != last_content {
            stream.write_all(current_content.as_bytes()).await?;
            println!("New message sent: {}", current_content);
            last_content = current_content;
        }
    }
}

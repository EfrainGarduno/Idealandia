import re
import time
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})

    # Serve the local files
    import threading
    from http.server import HTTPServer, SimpleHTTPRequestHandler

    server = HTTPServer(('localhost', 8081), SimpleHTTPRequestHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()

    print("Navigating to local site...")
    page.goto("http://localhost:8081/index.html")

    # Click the chat section
    print("Opening chat section...")
    page.click('[data-section="chat"]')

    # Wait for the main avatar
    print("Waiting for avatar...")
    page.wait_for_selector("#idealita-hologram")

    # 1. State: Reposo (Idle)
    print("Capturing Reposo state...")
    time.sleep(1) # Let the animation settle
    page.screenshot(path="verification/idealita-reposo.png")

    # 2. State: Escuchando (Listening)
    print("Injecting Listening state...")
    page.evaluate('''() => {
        const hologram = document.getElementById('idealita-hologram');
        hologram.classList.add('state-listening');
        hologram.style.setProperty('--avatar-scale', '1.02');
        hologram.style.setProperty('--avatar-glow-size', '15px');
        hologram.style.setProperty('--avatar-glow-color', 'rgba(108, 64, 247, 0.7)');
    }''')
    time.sleep(1)
    page.screenshot(path="verification/idealita-escuchando.png")

    # 3. State: Hablando (Speaking)
    print("Injecting Speaking state...")
    page.evaluate('''() => {
        const hologram = document.getElementById('idealita-hologram');
        hologram.classList.remove('state-listening');
        hologram.classList.add('state-speaking');
        hologram.style.setProperty('--avatar-scale', '1.05');
        hologram.style.setProperty('--avatar-glow-size', '25px');
        hologram.style.setProperty('--avatar-glow-color', 'rgba(0, 229, 255, 0.9)');
    }''')
    time.sleep(1)
    page.screenshot(path="verification/idealita-hablando.png")

    browser.close()
    server.shutdown()
    print("Done capturing states.")

with sync_playwright() as playwright:
    run(playwright)

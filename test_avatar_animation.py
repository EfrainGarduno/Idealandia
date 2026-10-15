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
    page.wait_for_selector("#idealita-3d-container")

    # 1. State: Reposo (Idle)
    print("Capturing Reposo state...")
    time.sleep(2) # Let the model load and animation settle
    page.screenshot(path="verification/idealita-reposo.png")

    # 2. State: Escuchando (Listening)
    print("Injecting Listening state...")
    page.evaluate('''() => {
        const wrapper = document.getElementById('avatar-visual-wrapper');
        if (wrapper) wrapper.classList.add('state-listening');
    }''')
    time.sleep(1)
    page.screenshot(path="verification/idealita-escuchando.png")

    # 3. State: Hablando (Speaking)
    print("Injecting Speaking state...")
    page.evaluate('''() => {
        const wrapper = document.getElementById('avatar-visual-wrapper');
        if (wrapper) {
            wrapper.classList.remove('state-listening');
            wrapper.classList.add('state-speaking');
        }
    }''')
    time.sleep(1)
    page.screenshot(path="verification/idealita-hablando.png")

    browser.close()
    server.shutdown()
    print("Done capturing states.")

with sync_playwright() as playwright:
    run(playwright)

#!/bin/bash
cat << 'MD' >> report.md

## Auth & Admin Improvements

1. **Authentication Updates:**
    - The login form now accepts either the username or the registered email address.
    - A toggle button has been added to the password field to show/hide the password.
    - Rate-limiting (max 5 requests per 15 mins per IP) has been implemented on `/api/login` and `/api/recover` to prevent brute-force and enumeration attacks.

2. **Password Recovery:**
    - A new "Forgot Password?" flow has been introduced with UI sections for email submission and token-based password resetting.
    - Secure token generation using Node's native `crypto` module, hashed via `sha256` before database storage to protect against DB leaks.
    - The endpoints intentionally return generic success messages to avoid user enumeration.
    - Configured integration for `nodemailer` to dispatch real emails if the `SMTP_*` environment variables are provided (e.g., `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`).

3. **Admin Dashboard Responsiveness:**
    - Modified CSS targeting `.content-section` and `#admin` to utilize `max-width: 95%`, effectively widening the administrative views on desktop displays.
    - The `.table-responsive` wrapper now correctly applies `overflow-x: auto` as a block-level element, preserving layout stability.
    - Enforced `white-space: nowrap` on `th` cells to keep headers legible while letting table data (`td`) wrap naturally unless otherwise constrained, ensuring IDs/Emails are comfortably readable.
MD

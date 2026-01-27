# Syncorama Deployment

## Requirements
- Apache or Nginx
- PHP 7.4+ with OpenSSL and JSON extensions
- Write permissions on `uploads/`, `clipboard_history/`, and `data/`
- **HTTPS is required for WebAuthn (Passkeys)**

## Installation
1. Copy all files to your web server document root.
### Manual Installation (Shared Hosting)

1. Download the WebAuthn library: [https://github.com/lbuchs/WebAuthn/archive/master.zip](https://github.com/lbuchs/WebAuthn/archive/master.zip)
2. Extract the zip file.
3. Upload the contents of the `src` folder to `lib/lbuchs/WebAuthn/` on your server.
   *(See `lib/HOW_TO_INSTALL.txt` for details)*

### Permissions
Ensure the following directories are writable:
```bash
chmod 755 uploads clipboard_history data data/users.json
```
4. Edit `config.php` to set your `WEBAUTHN_ID` (domain name).

## First Time Setup (Registration)
1. Open the app in your browser (must be HTTPS or localhost).
2. Since there are no users, you will see a "Setup First Device" button.
3. Click it to register your device (TouchID, FaceID, Windows Hello, YubiKey, etc.).
4. This first device becomes the master key.

## Usage
- Login using your Passkey.
- Use the clipboard and file tools.
- Install as a PWA.

## Security Note
Passkeys provide strong authentication. 
Ensure `data/users.json` is not publicly accessible via the browser (e.g., use `.htaccess` or move `data` outside the web root).

const API_URL = 'api.php';

const app = {
    els: {
        loginScreen: document.getElementById('login-screen'),
        dashboardScreen: document.getElementById('dashboard-screen'),
        // No passkey input needed anymore, but maybe a button for "Login with Passkey"
        loginBox: document.querySelector('.login-box'),
        logoutBtn: document.getElementById('logout-btn'),
        pauseBtn: document.getElementById('pause-btn'),
        clipboardContent: document.getElementById('clipboard-content'),
        copyBtn: document.getElementById('copy-btn'),
        pasteBtn: document.getElementById('paste-btn'),
        dropZone: document.getElementById('drop-zone'),
        fileInput: document.getElementById('file-input'),
        uploadProgress: document.getElementById('upload-progress'),
        clipboardList: document.getElementById('clipboard-list'),
        fileList: document.getElementById('file-list'),
        imageGallery: document.getElementById('image-gallery')
    },

    state: {
        pollingInterval: null,
        isPaused: false,
        debug: false
    },

    log(...args) {
        if (this.state.debug) {
            console.log('[DEBUG]', ...args);
        }
    },

    init() {
        this.updateLoginUI(); // Initial Login UI render
        this.bindEvents();
        this.checkAuth();
    },

    updateLoginUI() {
        // Clear login box and add new buttons
        this.els.loginBox.innerHTML = `
            <h1>Syncorama</h1>
            <p>Secure Clipboard & File Sync</p>
            <div id="auth-actions" style="margin-top: 2rem; display: flex; flex-direction: column; gap: 10px;">
                <button id="webauthn-login-btn" class="primary-btn">Login with Passkey</button>
                <button id="webauthn-register-btn" class="secondary-btn hidden">Register New Device</button>
            </div>
            <p id="auth-status" style="margin-top: 1rem; font-size: 0.8rem; color: #888;"></p>
        `;
    },

    bindEvents() {
        // Re-bind dynamic elements
        document.body.addEventListener('click', (e) => {
            if (e.target.id === 'webauthn-login-btn') this.webAuthnLogin();
            if (e.target.id === 'webauthn-register-btn') this.webAuthnRegister();
        });

        this.els.logoutBtn.addEventListener('click', () => this.logout());
        this.els.pauseBtn.addEventListener('click', () => this.togglePause()); // New Listener
        this.els.copyBtn.addEventListener('click', () => this.copyToDevice());
        this.els.pasteBtn.addEventListener('click', () => this.pushToServer());

        // File Drag & Drop
        this.els.dropZone.addEventListener('click', () => this.els.fileInput.click());
        this.els.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.els.dropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.els.dropZone.addEventListener(eventName, () => this.els.dropZone.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.els.dropZone.addEventListener(eventName, () => this.els.dropZone.classList.remove('dragover'), false);
        });

        this.els.dropZone.addEventListener('drop', (e) => this.handleFiles(e.dataTransfer.files), false);

        // Clipboard History Click
        this.els.clipboardList.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li) return;
            const index = li.dataset.index;
            if (this.state.clipboardHistory && this.state.clipboardHistory[index]) {
                const content = this.state.clipboardHistory[index].content;
                this.els.clipboardContent.value = content;
                // Optional: visual feedback
                this.els.clipboardContent.focus();
                // Optional: Maybe auto-copy? The user just wants it in the field per request.
            }
        });

        // Global Paste Listener (Ctrl+V)
        document.addEventListener('paste', async (e) => {
            // Only handle if dashboard is visible (logged in)
            if (this.els.dashboardScreen.classList.contains('hidden')) return;

            // 1. Handle Files (Images, etc) from Clipboard
            if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                e.preventDefault();
                this.handleFiles(e.clipboardData.files);
                return;
            }

            // 2. Handle Text
            const text = e.clipboardData.getData('text');
            if (text) {
                // If user is typing in a different input (like search, though we don't have one yet), maybe skip?
                // But for this app, global paste syncing is the goal.

                // If pasting into the passkey input (unlikely due to hidden check), skip.
                if (e.target.tagName === 'INPUT' && e.target.type === 'password') return;

                e.preventDefault();
                this.els.clipboardContent.value = text;

                // Auto-save to server
                const pushRes = await this.pushToServer();
                if (pushRes && pushRes.success) this.refreshData();
            }
        });
    },

    async request(action, data = {}) {
        // For json payload
        try {
            const body = action === 'upload_file' ? data : JSON.stringify({ action, ...data });
            const headers = action === 'upload_file' ? {} : { 'Content-Type': 'application/json' };

            // Note: Upload uses FormData which shouldn't have Content-Type header set manually
            const opts = { method: 'POST' };
            if (action === 'upload_file') {
                // For file upload, 'data' is the formData object
                opts.body = data;
            } else {
                opts.headers = headers;
                opts.body = body;
            }

            const response = await fetch(API_URL, opts);
            const text = await response.text();
            this.log('API Response Raw:', text); // DEBUG LOG
            try {
                return JSON.parse(text);
            } catch (e) {
                console.error('SERVER ERROR:', text);
                document.getElementById('auth-status').innerText = 'Server Error (Check Console)'; // Show visual feedback
                return { success: false, message: 'Server Error: ' + text.substring(0, 100) };
            }
        } catch (e) {
            console.error('API Error:', e);
            return { success: false, message: 'Network error' };
        }
    },

    async checkAuth() {
        const res = await this.request('check_status');
        this.log('Auth check response:', res);

        if (res.success) {
            this.log('Server Debug:', res.data.debug);
            this.state.debug = res.data.appDebug || false;

            if (res.data.appDemo) {
                this.setStatus('Demo Mode Enabled (Public Access)');
                document.getElementById('auth-status').style.color = 'var(--accent-1)';
            }

            if (res.data.loggedIn) {
                this.showDashboard();
            } else {
                this.showLogin(res.data.hasUsers);
            }
        } else {
            // If check_status fails, show the error
            document.body.innerHTML = `<div style="color:red; padding:20px;"><h1>Connection Error</h1><p>${res.message}</p><pre>${JSON.stringify(res, null, 2)}</pre></div>`;
        }
    },

    showLogin(hasUsers) {
        this.els.loginScreen.classList.remove('hidden');
        this.els.dashboardScreen.classList.add('hidden');
        this.stopPolling();

        const regBtn = document.getElementById('webauthn-register-btn');
        const loginBtn = document.getElementById('webauthn-login-btn');

        if (!hasUsers) {
            // First time setup
            regBtn.classList.remove('hidden');
            regBtn.innerText = 'Setup First Device';
            loginBtn.classList.add('hidden');
            this.setStatus('Welcome! Setup your passkey.');
        } else {
            regBtn.classList.add('hidden');
            loginBtn.classList.remove('hidden');
            this.setStatus('');
        }
    },

    showDashboard() {
        this.els.loginScreen.classList.add('hidden');
        this.els.dashboardScreen.classList.remove('hidden');
        this.refreshData();
        this.startPolling();
    },

    setStatus(msg) {
        const el = document.getElementById('auth-status');
        if (el) el.innerText = msg;
    },

    // --- WebAuthn Logic ---

    async webAuthnRegister() {
        this.setStatus('Generating challenge...');
        const challengeRes = await this.request('register_challenge');
        if (!challengeRes.success) {
            alert(challengeRes.message);
            return;
        }

        const responseData = challengeRes.data;
        let createOptions;

        // Check if the server returned the standard structure { publicKey: ... }
        if (responseData.publicKey) {
            responseData.publicKey.challenge = this.base64UrlDecode(responseData.publicKey.challenge);
            responseData.publicKey.user.id = this.base64UrlDecode(responseData.publicKey.user.id);
            if (responseData.publicKey.excludeCredentials) {
                responseData.publicKey.excludeCredentials.forEach(c => {
                    c.id = this.base64UrlDecode(c.id);
                });
            }
            createOptions = responseData;
        } else {
            // Fallback for flat structure (if any)
            responseData.challenge = this.base64UrlDecode(responseData.challenge);
            responseData.user.id = this.base64UrlDecode(responseData.user.id);
            createOptions = { publicKey: responseData };
        }

        this.setStatus('Waiting for authenticator...');

        try {
            const credential = await navigator.credentials.create(createOptions);

            const clientDataJSON = this.arrayBufferToBase64(credential.response.clientDataJSON);
            const attestationObject = this.arrayBufferToBase64(credential.response.attestationObject);

            this.setStatus('Verifying...');
            const verifyRes = await this.request('register_verify', {
                clientDataJSON,
                attestationObject
            });

            if (verifyRes.success) {
                this.showDashboard();
            } else {
                alert('Registration failed: ' + verifyRes.message);
                this.setStatus('Registration failed.');
            }
        } catch (e) {
            console.error(e);
            this.setStatus('Registration cancelled or failed.');
        }
    },

    async webAuthnLogin() {
        this.setStatus('Getting challenge...');

        const challengeRes = await this.request('login_challenge');
        if (!challengeRes.success) {
            alert(challengeRes.message);
            return;
        }

        let options = challengeRes.data;

        if (options.publicKey) {
            options.publicKey.challenge = this.base64UrlDecode(options.publicKey.challenge);
            if (options.publicKey.allowCredentials) {
                options.publicKey.allowCredentials.forEach(c => {
                    c.id = this.base64UrlDecode(c.id);
                });
            }
        }

        this.setStatus('Waiting for authenticator...');

        try {
            const assertion = await navigator.credentials.get(options);

            const authData = {
                id: this.arrayBufferToBase64(assertion.rawId),
                clientDataJSON: this.arrayBufferToBase64(assertion.response.clientDataJSON),
                authenticatorData: this.arrayBufferToBase64(assertion.response.authenticatorData),
                signature: this.arrayBufferToBase64(assertion.response.signature),
                userHandle: assertion.response.userHandle ? this.arrayBufferToBase64(assertion.response.userHandle) : null
            };

            this.setStatus('Verifying...');

            const verifyRes = await this.request('login_verify', authData);

            if (verifyRes.success) {
                this.showDashboard();
            } else {
                alert('Login failed: ' + verifyRes.message);
                this.setStatus('Login failed.');
            }

        } catch (e) {
            console.error(e);
            this.setStatus('Login cancelled or failed.');
        }
    },

    // --- Helpers ---

    base64UrlDecode(input) {
        // Handle null/undefined
        if (!input) return new Uint8Array(0);

        // If input is not a string, check if it's already an array buffer or similar, otherwise error
        if (typeof input !== 'string') {
            console.warn('base64UrlDecode expected string, got:', typeof input, input);
            return new Uint8Array(0);
        }

        // Handle PHP "=?BINARY?B?..." format (just in case)
        if (input.startsWith('=?BINARY?B?')) {
            try {
                const inner = input.substring(11, input.length - 2);
                return Uint8Array.from(atob(inner), c => c.charCodeAt(0));
            } catch (e) { console.error('Decoding BINARY format failed', e); return new Uint8Array(0); }
        }

        // Replace non-url compatible chars with base64 standard chars
        const base64 = input
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        // Pad with standard base64 required padding characters
        const pad = base64.length % 4;
        const padded = pad ? base64 + '='.repeat(4 - pad) : base64;

        try {
            return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
        } catch (e) {
            console.error('Base64Decode failed', e);
            return new Uint8Array(0);
        }
    },

    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    // --- Existing App Logic ---

    async refreshData() {
        if (this.state.isPaused) return; // Skip if paused

        const historyRes = await this.request('get_history');
        if (historyRes.success) this.updateClipboardUI(historyRes.data);

        const filesRes = await this.request('get_files');
        if (filesRes.success) this.updateFilesUI(filesRes.data);
    },

    startPolling() {
        if (this.state.pollingInterval) clearInterval(this.state.pollingInterval);
        this.state.pollingInterval = setInterval(() => this.refreshData(), 5000);
    },

    togglePause() {
        this.state.isPaused = !this.state.isPaused;
        this.els.pauseBtn.innerText = this.state.isPaused ? 'Resume' : 'Pause';
        this.els.pauseBtn.style.borderColor = this.state.isPaused ? 'var(--accent-1)' : '';
        this.els.pauseBtn.style.color = this.state.isPaused ? 'var(--accent-1)' : '';
    },

    stopPolling() {
        if (this.state.pollingInterval) clearInterval(this.state.pollingInterval);
    },

    async logout() {
        await this.request('logout');
        location.reload();
    },

    // Clipboard Logic
    updateClipboardUI(data) {
        // Store history for click handlers
        this.state.clipboardHistory = data.history;

        if (data.current && document.activeElement !== this.els.clipboardContent) {
            this.els.clipboardContent.value = data.current;
        }

        this.els.clipboardList.innerHTML = data.history.map((item, index) => {
            const safeName = item.filename.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
            return `
            <li data-index="${index}" style="cursor: pointer;">
                <div class="content-preview">${escapeHtml(item.content.substring(0, 50))}${item.content.length > 50 ? '...' : ''}</div>
                <div class="meta-group">
                    <span class="meta">${new Date(item.time * 1000).toLocaleString()}</span>
                    <button class="secondary-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-right: 5px;" onclick="app.downloadClipboardItem(${index}, event)">dl</button>
                    <button class="hide-btn" data-type="clipboard" data-name="${safeName}" onclick="app.handleHideClick(this, event)">hide</button>
                </div>
            </li>
        `}).join('');
    },

    async copyToDevice() {
        const text = this.els.clipboardContent.value;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            const originalText = this.els.copyBtn.innerText;
            this.els.copyBtn.innerText = 'Copied!';
            setTimeout(() => this.els.copyBtn.innerText = originalText, 2000);
        } catch (err) { alert('Failed to copy'); }
    },

    downloadClipboardItem(index, event) {
        event.stopPropagation();
        const item = this.state.clipboardHistory[index];
        if (!item) return;

        const blob = new Blob([item.content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    async pushToServer() {
        try {
            // Try to read clipboard items (images support)
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    // Prioritize images
                    const imageType = item.types.find(type => type.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        const file = new File([blob], `clipboard_image_${new Date().toISOString().replace(/[:.]/g, '-')}.${imageType.split('/')[1]}`, { type: imageType });

                        // Reuse handleFiles logic manually to upload
                        this.els.uploadProgress.classList.remove('hidden');
                        const formData = new FormData();
                        formData.append('action', 'upload_file');
                        formData.append('file', file);

                        const res = await this.request('upload_file', formData);
                        if (res.success) {
                            alert('Image uploaded from clipboard!');
                            this.refreshData();
                        } else {
                            alert('Upload failed: ' + res.message);
                        }
                        this.els.uploadProgress.classList.add('hidden');
                        return; // Stop after finding an image
                    }
                }
            } catch (err) {
                // Permission denied or not supported, fall back to text
                console.log('Clipboard read() failed or empty, falling back to text', err);
            }

            // Fallback to text
            const text = await navigator.clipboard.readText();
            if (!text) return;
            this.els.clipboardContent.value = text;
            const res = await this.request('save_clipboard', { text });
            if (res.success) this.refreshData();
        } catch (err) {
            const textVal = this.els.clipboardContent.value;
            if (textVal) {
                const res = await this.request('save_clipboard', { text: textVal });
                if (res.success) this.refreshData();
            } else {
                alert('Could not read clipboard. Paste manually.');
            }
        }
    },

    // File Logic
    async handleFiles(files) {
        if (!files.length) return;
        const file = files[0];
        this.els.uploadProgress.classList.remove('hidden');

        const formData = new FormData();
        formData.append('action', 'upload_file');
        formData.append('file', file);

        try {
            const res = await this.request('upload_file', formData); // Passed as data for special handling in request()
            if (res.success) {
                this.refreshData();
            } else {
                alert('Upload failed: ' + res.message);
            }
        } catch (e) {
            alert('Upload error');
        } finally {
            this.els.uploadProgress.classList.add('hidden');
        }
    },

    updateFilesUI(data) {
        const images = [];
        const others = [];
        const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'];

        data.files.forEach(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            if (imgExts.includes(ext)) {
                images.push(file);
            } else {
                others.push(file);
            }
        });

        // Render Images
        this.els.imageGallery.innerHTML = images.map(file => {
            // Safe filename escaping for attribute
            const safeName = file.name.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
            return `
            <li class="gallery-item">
                <img src="${file.url}" class="gallery-thumb" alt="${escapeHtml(file.name)}" onclick="window.open('${file.url}', '_blank')">
                <div class="gallery-meta">
                    <div class="gallery-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
                    <div style="display: flex; gap: 5px; margin-top: auto;">
                        <a href="${file.url}" download="${file.name}" class="gallery-download-btn" style="flex: 1;">Download</a>
                        <button class="hide-btn" data-type="file" data-name="${safeName}" onclick="app.handleHideClick(this, event)">hide</button>
                    </div>
                </div>
            </li>
        `}).join('');

        // Render Other Files
        this.els.fileList.innerHTML = others.map(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            const isPdf = ext === 'pdf';
            const safeName = file.name.replace(/'/g, "&apos;").replace(/"/g, "&quot;");

            return `
            <li>
                <div>
                    <strong>${escapeHtml(file.name)}</strong>
                    <div class="meta">${formatSize(file.size)}</div>
                </div>
                <div class="actions">
                    ${isPdf ? `<a href="${file.url}" target="_blank" class="secondary-btn" style="padding: 5px 10px; font-size: 0.8rem; margin-right: 5px;">Preview</a>` : ''}
                    <a href="${file.url}" download="${file.name}" class="secondary-btn" style="padding: 5px 10px; font-size: 0.8rem;">Download</a>
                    <button class="hide-btn" data-type="file" data-name="${safeName}" onclick="app.handleHideClick(this, event)">hide</button>
                </div>
            </li>
        `}).join('');
    },

    handleHideClick(btn, event) {
        event.stopPropagation();
        const type = btn.dataset.type;
        const name = btn.dataset.name;
        this.hideItem(type, name);
    },

    async hideItem(type, name, event = null) {
        if (event) event.stopPropagation();

        if (confirm(`Are you sure you want to hide "${name}"? It will no longer be visible in the list.`)) {
            const res = await this.request('hide_item', { type, name });
            if (res.success) {
                this.refreshData();
            } else {
                alert('Failed to hide item: ' + res.message);
            }
        }
    }
};

// Utilities
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

app.init();

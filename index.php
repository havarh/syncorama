<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Syncorama</title>
    <link rel="icon" href="icon.png">
    <link rel="stylesheet" href="style.css?v=<?php echo filemtime('style.css'); ?>">
    <link rel="manifest" href="manifest.json">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <meta name="theme-color" content="#5865f2">
</head>

<body>

    <div id="app">
        <!-- LOGIN SCREEN -->
        <div id="login-screen" class="screen">
            <div class="login-box">
                <h1>Syncorama</h1>
                <p>Secure Clipboard & File Sync</p>
                <input type="password" id="passkey-input" placeholder="Enter Passkey" autofocus>
                <button id="login-btn">Unlock</button>
            </div>
        </div>

        <!-- DASHBOARD SCREEN -->
        <div id="dashboard-screen" class="screen hidden">
            <header>
                <div class="logo">Syncorama</div>
                <div style="display: flex; gap: 10px;">
                    <button id="add-device-btn" class="icon-btn" title="Add New Passkey Device">＋</button>
                    <button id="pause-btn" class="icon-btn">⏸</button>
                    <button id="logout-btn" class="icon-btn">Logout</button>
                </div>
            </header>

            <main>
                <!-- Clipboard Section -->
                <section class="card clipboard-card">
                    <h2>Clipboard</h2>
                    <div class="clipboard-actions">
                        <textarea id="clipboard-content" placeholder="Current clipboard content..."></textarea>
                        <div class="btn-group">
                            <button id="copy-btn" class="primary-btn">Copy to Device</button>
                            <button id="paste-btn" class="secondary-btn">Paste to Server</button>
                        </div>
                    </div>
                </section>

                <!-- File Drop Section -->
                <section class="card file-card">
                    <h2>File Transfer</h2>
                    <div id="drop-zone" class="drop-zone">
                        <input type="file" id="file-input" hidden>
                        <p>Drag & Drop files here or click to upload</p>
                        <div class="upload-progress hidden" id="upload-progress">Uploading...</div>
                    </div>
                </section>

                <!-- History Lists -->
                <div class="grid-cols">
                    <section class="card history-card">
                        <h3>Clipboard History</h3>
                        <ul id="clipboard-list">
                            <!-- Items populated by JS -->
                        </ul>
                    </section>

                    <section class="card files-list-card">
                        <h3>Uploaded Files</h3>
                        <ul id="image-gallery" class="gallery-grid">
                            <!-- Images populated by JS -->
                        </ul>
                        <ul id="file-list">
                            <!-- Other files populated by JS -->
                        </ul>
                    </section>
                </div>
            </main>
        </div>
    </div>

    <script src="script.js?v=<?php echo filemtime('script.js'); ?>"></script>
    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js');
        }
    </script>
</body>

</html>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Syncorama - Anonymous Upload</title>
    <link rel="icon" href="../icon.png">
    <link rel="stylesheet" href="style.css?v=<?php echo filemtime('style.css'); ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
    <meta name="theme-color" content="#5865f2">
</head>

<body>

    <div id="app">
        <header>
            <div class="logo">Syncorama</div>
            <div class="subtitle">Anonymous Upload & Share</div>
        </header>

        <main>
            <!-- Clipboard Section -->
            <section class="card">
                <h2>Paste Text</h2>
                <textarea id="clipboard-content" placeholder="Paste your text here..."></textarea>
                <button id="paste-btn" class="primary-btn">Share Text</button>
            </section>

            <!-- File Upload Section -->
            <section class="card">
                <h2>Upload Files</h2>
                <div id="drop-zone" class="drop-zone">
                    <input type="file" id="file-input" hidden multiple>
                    <p>Drag & Drop files here or click to upload</p>
                    <div class="upload-progress hidden" id="upload-progress">Uploading...</div>
                </div>
            </section>

            <!-- Recently Shared Section -->
            <section id="shared-section" class="card hidden">
                <h2>Shared in this session</h2>
                <ul id="shared-items">
                    <!-- Populated by JS -->
                </ul>
            </section>
        </main>
    </div>

    <script src="script.js?v=<?php echo filemtime('script.js'); ?>"></script>
</body>

</html>
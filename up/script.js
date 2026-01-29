// up/script.js

document.addEventListener('DOMContentLoaded', () => {
    const pasteBtn = document.getElementById('paste-btn');
    const clipboardContent = document.getElementById('clipboard-content');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadProgress = document.getElementById('upload-progress');
    const sharedSection = document.getElementById('shared-section');
    const sharedItems = document.getElementById('shared-items');

    const API_URL = 'api.php';

    // Session local history
    let sharedSessionItems = [];

    const addSharedItem = (name, type) => {
        sharedSessionItems.unshift({ name, type, time: new Date().toLocaleTimeString() });
        renderSharedItems();
    };

    const renderSharedItems = () => {
        if (sharedSessionItems.length > 0) {
            sharedSection.classList.remove('hidden');
        }

        sharedItems.innerHTML = sharedSessionItems.map(item => `
            <li class="item">
                <div class="item-info">
                    <span class="item-name">${item.name}</span>
                    <span class="item-meta">${item.type} • ${item.time}</span>
                </div>
                <div class="item-status">✅ Shared</div>
            </li>
        `).join('');
    };

    // Clipboard Paste
    pasteBtn.addEventListener('click', async () => {
        const text = clipboardContent.value.trim();
        if (!text) return;

        pasteBtn.disabled = true;
        pasteBtn.textContent = 'Sharing...';

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save_clipboard', text })
            });

            const result = await response.json();
            if (result.success) {
                addSharedItem('Pasted Text', 'Clipboard');
                clipboardContent.value = '';
                alert('Text shared successfully!');
            } else {
                alert('Error: ' + result.message);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to share text.');
        } finally {
            pasteBtn.disabled = false;
            pasteBtn.textContent = 'Share Text';
        }
    });

    // File Upload
    const uploadFiles = async (files) => {
        if (files.length === 0) return;

        uploadProgress.classList.remove('hidden');
        uploadProgress.textContent = `Uploading ${files.length} file(s)...`;

        for (const file of files) {
            const formData = new FormData();
            formData.append('action', 'upload_file');
            formData.append('file', file);

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.success) {
                    addSharedItem(file.name, 'File');
                } else {
                    console.error('File upload failed:', result.message);
                }
            } catch (err) {
                console.error('Upload error:', err);
            }
        }

        uploadProgress.classList.add('hidden');
    };

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
        uploadFiles(fileInput.files);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        uploadFiles(e.dataTransfer.files);
    });

    // Handle Pasting Files
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        const files = [];

        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    files.push(file);
                }
            }
        }

        if (files.length > 0) {
            uploadFiles(files);
        }
    });
});

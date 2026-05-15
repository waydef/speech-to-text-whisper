import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const audioInput = document.getElementById('audio-input');
const fileInfo = document.getElementById('file-info');
const processBtn = document.getElementById('process-btn');
const statusText = document.getElementById('status-text');
const progressBarBg = document.getElementById('progress-bar-bg');
const progressBar = document.getElementById('progress-bar');
const sessionsContainer = document.getElementById('sessions-container');
const languageSelect = document.getElementById('language-select');
const modelSelect = document.getElementById('model-select');

const recordBtn = document.getElementById('record-btn');

let recognizer = null;
let currentFile = null;
let currentModel = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Initialize model
async function initModel() {
    const selectedModel = modelSelect.value;
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    modelSelect.style.setProperty('--select-color', selectedOption.dataset.color);

    if (recognizer && currentModel === selectedModel) return;

    try {
        updateStatus('loading model...', 'info');
        progressBarBg.style.display = 'block';
        progressBar.style.width = '30%';
        
        recognizer = await pipeline('automatic-speech-recognition', selectedModel);
        currentModel = selectedModel;
        
        progressBar.style.width = '100%';
        updateStatus('model ready', 'check');
        setTimeout(() => {
            if (!currentFile) progressBarBg.style.display = 'none';
        }, 1000);
        
        if (currentFile) processBtn.disabled = false;
    } catch (err) {
        updateStatus('error loading model', 'exclamation-triangle');
        console.error(err);
    }
}

function updateStatus(msg, icon) {
    statusText.innerHTML = `<i class="fas fa-${icon}"></i> ${msg}`;
}

// Drag & Drop Logic
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
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
        handleFile(file);
    }
});

dropZone.addEventListener('click', () => audioInput.click());

audioInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

function handleFile(file) {
    currentFile = file;
    fileInfo.textContent = `selected: ${file.name}`;
    if (recognizer) processBtn.disabled = false;
}

// Processing
processBtn.addEventListener('click', async () => {
    if (!currentFile || !recognizer) return;

    try {
        processBtn.disabled = true;
        progressBarBg.style.display = 'block';
        progressBar.style.width = '10%';
        updateStatus('transcribing...', 'spinner fa-spin');
        
        const audioUrl = URL.createObjectURL(currentFile);
        
        const lang = languageSelect.value;
        const options = {
            chunk_length_s: 30,
            stride_length_s: 5,
            task: 'transcribe',
        };
        
        if (lang !== 'auto') options.language = lang;

        const output = await recognizer(audioUrl, options);
        
        progressBar.style.width = '100%';
        updateStatus('done', 'check-circle');
        
        const sessionCard = document.createElement('div');
        sessionCard.className = 'session-card';
        const sessionId = Date.now();
        sessionCard.innerHTML = `
            <div class="session-header">
                <h3>transcription // ${new Date().toLocaleTimeString()}</h3>
                <div class="action-links">
                    <span class="action-link copy-action"><i class="far fa-copy"></i> copy</span>
                    <span class="action-link save-action"><i class="fas fa-download"></i> save</span>
                </div>
            </div>
            <div class="session-text">${output.text}</div>
        `;
        
        const copyAction = sessionCard.querySelector('.copy-action');
        copyAction.addEventListener('click', () => {
            navigator.clipboard.writeText(output.text);
            const originalText = copyAction.innerHTML;
            copyAction.innerHTML = '<i class="fas fa-check"></i> copied';
            setTimeout(() => copyAction.innerHTML = originalText, 2000);
        });

        const saveAction = sessionCard.querySelector('.save-action');
        saveAction.addEventListener('click', () => {
            const blob = new Blob([output.text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`transcription_\${sessionId}.txt\`;
            a.click();
            URL.revokeObjectURL(url);
        });

        sessionsContainer.prepend(sessionCard);
        
        URL.revokeObjectURL(audioUrl);
    } catch (err) {
        updateStatus('transcription failed', 'times-circle');
        console.error(err);
    } finally {
        processBtn.disabled = false;
    }
});

// Recording Logic
recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                // We need to pass it as a file-like object to handleFile
                const file = new File([audioBlob], "recorded_audio.webm", { type: 'audio/webm' });
                handleFile(file);
                
                // Stop tracks to release mic
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.classList.add('recording');
            recordBtn.innerHTML = '<i class="fas fa-stop"></i> stop recording';
            updateStatus('recording audio...', 'microphone');
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('microphone access denied or not available.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = '<i class="fas fa-microphone"></i> record voice';
        updateStatus('recording finished', 'check');
    }
});

modelSelect.addEventListener('change', initModel);

// Start init
initModel();

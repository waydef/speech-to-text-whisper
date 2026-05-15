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
const themeToggle = document.getElementById('theme-toggle');
const autoTranscribeCb = document.getElementById('auto-transcribe-cb');

const recordBtn = document.getElementById('record-btn');

let recognizer = null;
let currentFile = null;
let currentModel = null;
let mediaRecorder = null;
let currentStream = null;
let audioChunks = [];
let isRecording = false;

const processBtnText = processBtn.querySelector('.btn-text');
const recordBtnText = recordBtn.querySelector('.btn-text');
const recordBtnIcon = recordBtn.querySelector('i');

function setBtnText(btnTextEl, btnIconEl, text, iconClass, callback) {
    btnTextEl.style.opacity = '0';
    if (btnIconEl) btnIconEl.style.opacity = '0';
    setTimeout(() => {
        btnTextEl.textContent = text;
        if (btnIconEl && iconClass) btnIconEl.className = `fas ${iconClass}`;
        btnTextEl.style.opacity = '1';
        if (btnIconEl) btnIconEl.style.opacity = '1';
        if (callback) callback();
    }, 300);
}

// Theme Toggle
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const icon = themeToggle.querySelector('i');
    if (document.body.classList.contains('light-theme')) {
        icon.className = 'fas fa-sun';
    } else {
        icon.className = 'fas fa-moon';
    }
});

// Setup Custom Selects
function setupCustomSelect(containerId, onChangeCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const trigger = container.querySelector('.custom-select-trigger');
    const options = container.querySelectorAll('.custom-select-option');
    const textSpan = container.querySelector('.custom-select-text');

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = container.classList.contains('open');
        document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('open'));
        if (!isOpen) container.classList.add('open');
    });

    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            textSpan.innerHTML = opt.innerHTML;
            container.classList.remove('open');
            if (onChangeCallback) onChangeCallback(opt.dataset.value, opt.dataset.color);
        });
    });

    const selectedOpt = container.querySelector('.custom-select-option.selected') || options[0];
    selectedOpt.classList.add('selected');
    textSpan.innerHTML = selectedOpt.innerHTML;
    
    return {
        getValue: () => container.querySelector('.custom-select-option.selected').dataset.value,
        setValue: (val) => {
            const match = Array.from(options).find(o => o.dataset.value === val);
            if (match) match.click();
        }
    };
}

let currentLang = 'english';
const langSelectObj = setupCustomSelect('lang-custom-select', (val) => currentLang = val);

let currentModelVal = 'Xenova/whisper-base';
const modelSelectObj = setupCustomSelect('model-custom-select', (val, color) => {
    currentModelVal = val;
    document.getElementById('model-custom-select').style.setProperty('--select-color', color);
    
    if (recognizer && currentModel !== currentModelVal) {
        setBtnText(processBtnText, processBtn.querySelector('i'), 'load model', 'fa-download');
        processBtn.disabled = false;
    }
});

// Set initial color
const initialSelected = document.querySelector('#model-custom-select .custom-select-option.selected');
if (initialSelected && initialSelected.dataset.color) {
    document.getElementById('model-custom-select').style.setProperty('--select-color', initialSelected.dataset.color);
}

// Close custom selects on outside click
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('open'));
});

// Initialize model
async function initModel() {
    const selectedModel = currentModelVal;

    if (recognizer && currentModel === selectedModel) return;

    try {
        processBtn.disabled = true;
        setBtnText(processBtnText, processBtn.querySelector('i'), 'loading...', 'fa-spinner fa-spin');
        updateStatus('loading model...', 'info');
        progressBarBg.style.display = 'block';
        progressBar.style.width = '30%';
        
        recognizer = await pipeline('automatic-speech-recognition', selectedModel);
        currentModel = selectedModel;
        
        progressBar.style.width = '100%';
        updateStatus('model ready', 'check');
        setTimeout(() => {
            progressBarBg.style.display = 'none';
        }, 1000);
        
        setBtnText(processBtnText, processBtn.querySelector('i'), 'transcribe', 'fa-magic', () => {
            processBtn.disabled = !currentFile;
        });
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
    if (recognizer && currentModel === currentModelVal) {
        processBtn.disabled = false;
    }
}

// Processing
processBtn.addEventListener('click', async () => {
    if (!recognizer || currentModel !== currentModelVal) {
        await initModel();
        return;
    }

    if (!currentFile) return;

    try {
        processBtn.disabled = true;
        progressBarBg.style.display = 'block';
        progressBar.style.width = '10%';
        updateStatus('transcribing...', 'spinner fa-spin');
        recordBtn.disabled = true;
        
        const audioUrl = URL.createObjectURL(currentFile);
        
        const lang = currentLang;
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
                    <span class="action-link delete-action"><i class="fas fa-trash"></i> delete</span>
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
            a.download = `transcription_${sessionId}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        });

        const deleteAction = sessionCard.querySelector('.delete-action');
        deleteAction.addEventListener('click', () => {
            sessionCard.style.animation = 'fadeIn 0.3s ease reverse forwards';
            setTimeout(() => sessionCard.remove(), 300);
        });

        sessionsContainer.prepend(sessionCard);
        
        URL.revokeObjectURL(audioUrl);
    } catch (err) {
        updateStatus('transcription failed', 'times-circle');
        console.error(err);
    } finally {
        processBtn.disabled = false;
        recordBtn.disabled = false;
    }
});

// Recording Logic
recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(currentStream);
            audioChunks = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const file = new File([audioBlob], "recorded_audio.webm", { type: 'audio/webm' });
                handleFile(file);
                
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                    currentStream = null;
                }

                if (autoTranscribeCb.checked && currentFile) {
                    processBtn.click();
                }
            };

            mediaRecorder.start();
            isRecording = true;
            setBtnText(recordBtnText, recordBtnIcon, 'stop recording', 'fa-stop', () => {
                recordBtn.classList.add('recording');
            });
            updateStatus('recording audio...', 'microphone');
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('microphone access denied or not available.');
        }
    } else {
        mediaRecorder.stop();
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        isRecording = false;
        recordBtn.classList.remove('recording');
        setBtnText(recordBtnText, recordBtnIcon, 'record voice', 'fa-microphone');
        updateStatus('recording finished', 'check');
    }
});

// Auto detect language from browser
const userLang = navigator.language || navigator.userLanguage;
const baseLang = userLang.split('-')[0];

const langMap = {
    'en': 'english',
    'ru': 'russian',
    'es': 'spanish',
    'fr': 'french',
    'de': 'german',
    'zh': 'chinese',
    'ja': 'japanese',
    'ko': 'korean',
    'pt': 'portuguese',
    'it': 'italian'
};

if (langMap[baseLang]) {
    const langVal = langMap[baseLang];
    if (langSelectObj) langSelectObj.setValue(langVal);
}

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
const voiceCommandsCb = document.getElementById('voice-commands-cb');

const recordBtn = document.getElementById('record-btn');

let recognizer = null;
let fileQueue = [];
let isProcessing = false;
let currentModel = null;
let mediaRecorder = null;
let currentStream = null;
let audioChunks = [];
let isRecording = false;

const processBtnText = processBtn.querySelector('.btn-text');
const recordBtnText = recordBtn.querySelector('.btn-text');
const recordBtnIcon = recordBtn.querySelector('i');

function setBtnText(btnTextEl, btnIconEl, text, iconClass, callback) {
    btnTextEl.textContent = text;
    if (btnIconEl && iconClass) btnIconEl.className = `fas ${iconClass}`;
    if (callback) callback();
}

// Theme Toggle
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const icon = themeToggle.querySelector('i');
    if (document.body.classList.contains('light-theme')) {
        icon.className = 'fas fa-sun';
    } else {
        icon.className = 'fas fa-circle-half-stroke';
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
        setBtnText(processBtnText, processBtn.querySelector('i'), 'load model', 'fa-brain');
        processBtn.disabled = false;
    }
});

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
        updateStatus('loading model...', 'info-circle');
        progressBar.style.width = '30%';
        
        recognizer = await pipeline('automatic-speech-recognition', selectedModel);
        currentModel = selectedModel;
        
        progressBar.style.width = '100%';
        updateStatus('model ready', 'check-circle');
        setTimeout(() => {
            progressBar.style.width = '0%';
        }, 1000);
        
        setBtnText(processBtnText, processBtn.querySelector('i'), 'transcribe', 'fa-magic', () => {
            processBtn.disabled = fileQueue.length === 0;
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
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
    if (files.length > 0) {
        handleFiles(files);
    }
});

dropZone.addEventListener('click', () => audioInput.click());

audioInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) handleFiles(files);
});

function handleFiles(files, isVoice = false) {
    files.forEach(file => {
        file.isVoice = isVoice;
        fileQueue.push(file);
    });
    
    fileInfo.textContent = fileQueue.length === 1 
        ? `selected: ${fileQueue[0].name}` 
        : `${fileQueue.length} files selected`;

    if (recognizer && currentModel === currentModelVal) {
        processBtn.disabled = false;
    }

    if (autoTranscribeCb.checked && !isProcessing) {
        processBtn.click();
    }
}

// Processing
processBtn.addEventListener('click', async () => {
    if (!recognizer || currentModel !== currentModelVal) {
        await initModel();
        if (fileQueue.length > 0) processBtn.click();
        return;
    }

    if (fileQueue.length === 0 || isProcessing) return;

    isProcessing = true;
    processBtn.disabled = true;
    recordBtn.disabled = true;

    try {
        while (fileQueue.length > 0) {
            const file = fileQueue.shift();
            const fileName = file.isVoice ? 'Voice Recording' : file.name;
            
            updateStatus(`transcribing: ${fileName}`, 'spinner fa-spin');
            progressBar.style.width = '10%';

            const audioUrl = URL.createObjectURL(file);
            const lang = currentLang;
            const options = {
                chunk_length_s: 30,
                stride_length_s: 5,
                task: 'transcribe',
            };
            
            if (lang !== 'auto') options.language = lang;

            const output = await recognizer(audioUrl, options);
            
            progressBar.style.width = '100%';

            if (voiceCommandsCb && voiceCommandsCb.checked) {
                handleVoiceCommand(output.text);
            }
            
            const sessionCard = document.createElement('div');
            sessionCard.className = 'session-card';
            const sessionId = Date.now();
            sessionCard.innerHTML = `
                <div class="session-header">
                    <h3>${fileName} // ${new Date().toLocaleTimeString()}</h3>
                    <div class="action-links">
                        <span class="action-link copy-action"><i class="far fa-copy"></i> copy</span>
                        <span class="action-link save-action"><i class="fas fa-download"></i> save</span>
                        <span class="action-link delete-action"><i class="fas fa-trash"></i> delete</span>
                    </div>
                </div>
                <div class="session-text">${output.text}</div>
            `;
            
            setupSessionCardEvents(sessionCard, output.text, sessionId);
            sessionsContainer.prepend(sessionCard);
            
            URL.revokeObjectURL(audioUrl);
            
            if (fileQueue.length > 0) {
                fileInfo.textContent = `${fileQueue.length} files left in queue`;
            } else {
                fileInfo.textContent = 'drag & drop audio file here or click to browse';
            }
        }
        
        updateStatus('all tasks finished', 'check-circle');
    } catch (err) {
        updateStatus('transcription failed', 'times-circle');
        console.error(err);
    } finally {
        isProcessing = false;
        processBtn.disabled = false;
        recordBtn.disabled = false;
        
        // RESET BUTTON STATE
        recordBtn.removeAttribute('data-state');
        setBtnText(recordBtnText, recordBtnIcon, 'record voice', 'fa-microphone-lines');
        
        setTimeout(() => {
            progressBar.style.width = '0%';
        }, 1000);
    }
});

function setupSessionCardEvents(card, text, id) {
    const copyAction = card.querySelector('.copy-action');
    copyAction.addEventListener('click', () => {
        navigator.clipboard.writeText(text);
        const originalText = copyAction.innerHTML;
        copyAction.innerHTML = '<i class="fas fa-check"></i> copied';
        setTimeout(() => copyAction.innerHTML = originalText, 2000);
    });

    const saveAction = card.querySelector('.save-action');
    saveAction.addEventListener('click', () => {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcription_${id}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    });

    const deleteAction = card.querySelector('.delete-action');
    deleteAction.addEventListener('click', () => {
        card.style.animation = 'fadeOut 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards';
        setTimeout(() => card.remove(), 500);
    });
}

// Recording Logic
recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
            currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(currentStream, { mimeType });
            audioChunks = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const file = new File([audioBlob], "recorded_audio.webm", { type: 'audio/webm' });
                handleFiles([file], true);
                
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                    currentStream = null;
                }
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.setAttribute('data-state', 'recording');
            setBtnText(recordBtnText, recordBtnIcon, 'stop recording', 'fa-stop');
            updateStatus('recording audio...', 'microphone');
            startVisualizer(currentStream);
            updateVisualizerState(true);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('microphone access denied or not available.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        updateVisualizerState(false);
        
        if (autoTranscribeCb.checked) {
            recordBtn.setAttribute('data-state', 'processing');
            setBtnText(recordBtnText, recordBtnIcon, 'analyzing...', 'fa-spinner fa-spin');
        } else {
            recordBtn.removeAttribute('data-state');
            setBtnText(recordBtnText, recordBtnIcon, 'record voice', 'fa-microphone-lines');
        }
        updateStatus('recording finished', 'check');
    }
});

// Auto detect language
const userLang = navigator.language || navigator.userLanguage;
const baseLang = userLang.split('-')[0];
const langMap = {
    'en': 'english', 'ru': 'russian', 'es': 'spanish', 'fr': 'french',
    'de': 'german', 'zh': 'chinese', 'ja': 'japanese', 'ko': 'korean',
    'pt': 'portuguese', 'it': 'italian'
};
if (langMap[baseLang]) {
    const langVal = langMap[baseLang];
    if (langSelectObj) langSelectObj.setValue(langVal);
}

// Audio visualizer logic using Web Audio API
let audioCtx = null;
let analyser = null;
let dataArray = null;
let smoothedDataArray = null;
let smoothVolume = 0;
let currentAmplitude = 2.5;

const visualizerCanvas = document.getElementById('visualizer-canvas');
const visualizerContainer = document.getElementById('visualizer-container');
const visualizerCtx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;
const visualizerPlaceholder = document.getElementById('visualizer-placeholder');

let waveColor = { r: 100, g: 100, b: 100 };
let targetColor = { r: 100, g: 100, b: 100 };

function initVisualizer() {
    if (!visualizerCanvas) return;
    
    // Set dynamic size
    const rect = visualizerContainer.getBoundingClientRect();
    visualizerCanvas.width = rect.width * window.devicePixelRatio;
    visualizerCanvas.height = rect.height * window.devicePixelRatio;
    visualizerCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    dataArray = new Uint8Array(128);
    updateVisualizerState(false);
    
    drawWaveLoop();
}

function startVisualizer(stream) {
    if (!visualizerCanvas) return;
    
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

function drawWaveLoop() {
    requestAnimationFrame(drawWaveLoop);
    
    const width = visualizerCanvas.width / window.devicePixelRatio;
    const height = visualizerCanvas.height / window.devicePixelRatio;
    
    visualizerCtx.clearRect(0, 0, width, height);
    
    visualizerCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    visualizerCtx.fillRect(0, 0, width, height);
    
    // Smooth color interpolation
    waveColor.r += (targetColor.r - waveColor.r) * 0.1;
    waveColor.g += (targetColor.g - waveColor.g) * 0.1;
    waveColor.b += (targetColor.b - waveColor.b) * 0.1;
    
    visualizerCtx.lineWidth = 3;
    visualizerCtx.strokeStyle = `rgb(${Math.round(waveColor.r)}, ${Math.round(waveColor.g)}, ${Math.round(waveColor.b)})`;
    
    const glowAlpha = (waveColor.g - 100) / (255 - 100);
    if (glowAlpha > 0.01) {
        visualizerCtx.shadowColor = `rgba(95, 255, 135, ${glowAlpha * 0.5})`;
        visualizerCtx.shadowBlur = glowAlpha * 8;
    } else {
        visualizerCtx.shadowBlur = 0;
    }
    
    // Process volume metrics
    if (isRecording && analyser) {
        analyser.getByteTimeDomainData(dataArray);
        
        // Calculate Root Mean Square (RMS) volume level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const dev = (dataArray[i] - 128) / 128.0;
            sum += dev * dev;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        
        // Dynamic volume smoothing (eliminates sudden twitches)
        smoothVolume += (rms - smoothVolume) * 0.15;
    } else {
        // Smoothly decay back to zero
        smoothVolume += (0 - smoothVolume) * 0.15;
    }
    
    // Configure wave height constraints
    const baseAmp = 2.5; // ambient height in idle mode
    const voiceScale = 160.0; // multiplier to amplify volume level
    const maxAmp = height * 0.42; // safe envelope boundary
    
    const targetAmp = isRecording ? Math.min(baseAmp + smoothVolume * voiceScale, maxAmp) : baseAmp;
    
    // Interpolate wave amplitude
    currentAmplitude += (targetAmp - currentAmplitude) * 0.12;
    
    // Render beautiful organic fluid waves
    visualizerCtx.beginPath();
    
    const numPoints = 120;
    const sliceWidth = width / numPoints;
    let x = 0;
    
    for (let i = 0; i <= numPoints; i++) {
        const t = Date.now() * 0.005;
        
        // 3 layers of harmonic sinewaves
        const sin1 = Math.sin(i * 0.07 - t);
        const sin2 = Math.sin(i * 0.13 + t * 1.4) * 0.35;
        const sin3 = Math.sin(i * 0.22 - t * 0.7) * 0.15;
        
        const waveVal = (sin1 + sin2 + sin3) / 1.5; // normalized values in range [-1, 1]
        
        // Pinching curve (0 at the edges, 1 in the middle)
        const envelope = Math.sin((i / numPoints) * Math.PI);
        
        const y = height / 2 + waveVal * currentAmplitude * envelope;
        
        if (i === 0) {
            visualizerCtx.moveTo(x, y);
        } else {
            visualizerCtx.lineTo(x, y);
        }
        
        x += sliceWidth;
    }
    
    visualizerCtx.lineTo(width, height / 2);
    visualizerCtx.stroke();
    visualizerCtx.shadowBlur = 0;
}

function updateVisualizerState(active) {
    if (active) {
        targetColor = { r: 95, g: 255, b: 135 }; // green
    } else {
        targetColor = { r: 100, g: 100, b: 100 }; // gray
    }
    
    if (visualizerPlaceholder) {
        const dot = visualizerPlaceholder.querySelector('.pulse-dot');
        if (dot) {
            dot.style.display = active ? 'inline-block' : 'none';
        }
    }
}

// Resize listener
window.addEventListener('resize', () => {
    if (!visualizerCanvas) return;
    const rect = visualizerContainer.getBoundingClientRect();
    visualizerCanvas.width = rect.width * window.devicePixelRatio;
    visualizerCanvas.height = rect.height * window.devicePixelRatio;
    visualizerCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
});

// Initialize on load
initVisualizer();

// Voice Command Handling
function handleVoiceCommand(rawText) {
    const text = rawText.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
    
    function showCommandToast(msg) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '2rem';
        toast.style.right = '2rem';
        toast.style.background = 'rgba(10, 25, 20, 0.95)';
        toast.style.border = '1px solid var(--accent)';
        toast.style.borderRadius = '8px';
        toast.style.padding = '0.75rem 1.25rem';
        toast.style.color = '#5fff87';
        toast.style.fontFamily = 'var(--font-mono)';
        toast.style.fontSize = '0.85rem';
        toast.style.boxShadow = '0 8px 32px rgba(95,255,135,0.15)';
        toast.style.zIndex = '9999';
        toast.style.animation = 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        toast.innerHTML = `<i class="fas fa-terminal"></i> Executed: [${msg}]`;
        
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    if (text.includes("очистить") || text.includes("стереть") || text.includes("clear history")) {
        const cards = sessionsContainer.querySelectorAll('.session-card');
        cards.forEach(card => {
            card.style.animation = 'fadeOut 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards';
            setTimeout(() => card.remove(), 500);
        });
        showCommandToast("очистить историю");
    } else if (text.includes("скопировать") || text.includes("копия") || text.includes("copy text")) {
        const firstCardText = sessionsContainer.querySelector('.session-text');
        if (firstCardText) {
            navigator.clipboard.writeText(firstCardText.textContent);
            showCommandToast("скопировать буфер");
        }
    } else if (text.includes("сохранить") || text.includes("скачать") || text.includes("save text")) {
        const firstCard = sessionsContainer.querySelector('.session-card');
        if (firstCard) {
            const saveAction = firstCard.querySelector('.save-action');
            if (saveAction) {
                saveAction.click();
                showCommandToast("сохранить файл");
            }
        }
    } else if (text.includes("сменить тему") || text.includes("переключить тему") || text.includes("theme togg")) {
        themeToggle.click();
        showCommandToast("переключить тему");
    }
}

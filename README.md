# speech-to-text-whisper

an offline, browser-based tool for converting speech to text locally. no external servers, api keys, or data uploads. everything runs on the client side using transformers.js and onnx runtime web.

check out the live page at https://waydef.github.io/speech-to-text-whisper/

## features

- fully offline: your audio never leaves your device. after downloading the model to your browser cache, the tool works without an internet connection.
- model options: choose between different model sizes, ranging from a fast tiny model (~40mb) to a more accurate medium model (~750mb).
- input methods: record voice directly from your microphone or drop any audio file into the browser window.
- quick export: copy the transcribed text in one click or download it as a .txt file.
- design: dark theme layout using simple glass cards and clean progress bars.

## running it

open index.html in a browser. for model caching to work correctly, you should run it through a local web server (for example, python -m http.server 8000).
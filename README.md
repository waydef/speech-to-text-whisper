# speech-to-text-whisper

Offline tool for local speech-to-text transcription directly in the browser. No external servers, API keys, or data leaks. Everything runs client-side using transformers.js and ONNX Runtime Web.

Check out the live page at https://waydef.github.io/speech-to-text-whisper/

## features

- privacy: audio is not uploaded to the internet. the model is downloaded once to the browser cache, after which transcription works fully locally and offline.
- quality selection: support for models of different sizes, from tiny (~40mb) for quick drafts to medium (~750mb) for high-accuracy recognition.
- microphone recording: record voice in real time or drag and drop any audio file into the window.
- auto-transcription: starts transcription immediately after adding a file or stopping a recording.
- interface: dark theme, glassmorphism card designs, Montserrat typography, smooth progress animations, quick export to .txt, and one-click copy.

## launch

Simply open `index.html` locally. For proper model caching and dynamic theme coloring via ColorThief, it is recommended to run the app through any local web server (e.g. `python -m http.server 8000`).
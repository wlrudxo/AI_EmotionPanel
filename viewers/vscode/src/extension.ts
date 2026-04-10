import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

function findProjectRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return undefined;
  for (const folder of folders) {
    const candidate = path.join(folder.uri.fsPath, "core", "state.json");
    if (fs.existsSync(candidate)) return folder.uri.fsPath;
  }
  return undefined;
}

function getStateFile(root: string): string {
  return path.join(root, "core", "state.json");
}

function getAssetsDir(root: string): string {
  return path.join(root, "assets");
}

interface EmotionState {
  emotion: string;
  line: string;
  statusLine: string;
  source: string;
  timestamp: number;
}

class EmotionPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claude-emotion-panel";
  private _view?: vscode.WebviewView;
  private _watcher?: fs.FSWatcher;
  private _stateFile: string;
  private _assetsDir: string;

  constructor(private readonly _extensionUri: vscode.Uri, projectRoot: string) {
    this._stateFile = getStateFile(projectRoot);
    this._assetsDir = getAssetsDir(projectRoot);
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.file(this._assetsDir),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Initial state
    this._sendState();

    // Watch state.json
    this._startWatching();

    webviewView.onDidDispose(() => {
      this._stopWatching();
    });
  }

  private _startWatching() {
    try {
      // Ensure state file directory exists
      const dir = path.dirname(this._stateFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Poll-based watching for reliability on Windows
      let lastContent = "";
      const interval = setInterval(() => {
        try {
          const content = fs.readFileSync(this._stateFile, "utf-8").trim();
          if (content !== lastContent) {
            lastContent = content;
            this._sendState();
          }
        } catch {}
      }, 300);

      // Also use fs.watch for faster response when available
      try {
        this._watcher = fs.watch(this._stateFile, () => {
          this._sendState();
        });
      } catch {}

      // Clean up interval on dispose
      this._view?.onDidDispose(() => {
        clearInterval(interval);
      });
    } catch (err) {
      console.error("Failed to watch state file:", err);
    }
  }

  private _stopWatching() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = undefined;
    }
  }

  private _sendState() {
    if (!this._view) return;
    try {
      const raw = fs.readFileSync(this._stateFile, "utf-8").trim();
      const state: EmotionState = JSON.parse(raw);

      // Convert asset path to webview URI
      const assetPath = path.join(this._assetsDir, `${state.emotion}.webp`);
      let imageUri = "";
      if (fs.existsSync(assetPath)) {
        imageUri = this._view.webview
          .asWebviewUri(vscode.Uri.file(assetPath))
          .toString();
      }

      this._view.webview.postMessage({
        type: "update",
        emotion: state.emotion,
        line: state.line,
        statusLine: state.statusLine,
        imageUri,
      });
    } catch {}
  }

  private _getHtml(webview: vscode.Webview): string {
    return /* html */ `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: transparent;
    font-family: var(--vscode-font-family);
    overflow: hidden;
    padding: 12px;
  }

  .image-container {
    position: relative;
    width: 100%;
    max-width: 280px;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emotion-img {
    position: absolute;
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: opacity 0.4s ease-in-out;
    border-radius: 12px;
  }

  .emotion-img.hidden {
    opacity: 0;
  }

  .emotion-img.visible {
    opacity: 1;
  }

  .speech-bubble {
    margin-top: 12px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 12px;
    padding: 10px 16px;
    text-align: center;
    max-width: 280px;
    width: 100%;
    position: relative;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.3s, transform 0.3s;
  }

  .speech-bubble.show {
    opacity: 1;
    transform: translateY(0);
  }

  .speech-bubble::before {
    content: '';
    position: absolute;
    top: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: 12px;
    height: 12px;
    background: var(--vscode-editor-background);
    border-left: 1px solid var(--vscode-widget-border, #444);
    border-top: 1px solid var(--vscode-widget-border, #444);
    transform: translateX(-50%) rotate(45deg);
  }

  .line-text {
    font-weight: 700;
    font-size: 13px;
    color: var(--vscode-editor-foreground);
  }

  .status-text {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
    opacity: 0.7;
  }
</style>
</head>
<body>
  <div class="image-container">
    <img id="img-a" class="emotion-img visible" />
    <img id="img-b" class="emotion-img hidden" />
  </div>
  <div id="bubble" class="speech-bubble">
    <div id="line" class="line-text"></div>
    <div id="status" class="status-text"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const imgA = document.getElementById('img-a');
    const imgB = document.getElementById('img-b');
    const bubble = document.getElementById('bubble');
    const lineEl = document.getElementById('line');
    const statusEl = document.getElementById('status');

    let currentFront = 'a'; // which img is currently visible

    window.addEventListener('message', (event) => {
      const { type, emotion, line, statusLine, imageUri } = event.data;
      if (type !== 'update') return;

      // Crossfade images
      if (imageUri) {
        const front = currentFront === 'a' ? imgA : imgB;
        const back = currentFront === 'a' ? imgB : imgA;

        back.onload = () => {
          front.classList.remove('visible');
          front.classList.add('hidden');
          back.classList.remove('hidden');
          back.classList.add('visible');
          currentFront = currentFront === 'a' ? 'b' : 'a';
        };
        back.src = imageUri;
      }

      // Update speech bubble
      const hasText = line || statusLine;
      if (hasText) {
        lineEl.textContent = line || '';
        statusEl.textContent = statusLine ? '(' + statusLine + ')' : '';
        bubble.classList.add('show');
      } else {
        bubble.classList.remove('show');
      }
    });
  </script>
</body>
</html>`;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.warn("Claude Emotion: core/state.json not found in workspace");
    return;
  }
  const provider = new EmotionPanelProvider(context.extensionUri, projectRoot);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      EmotionPanelProvider.viewType,
      provider
    )
  );
}

export function deactivate() {}

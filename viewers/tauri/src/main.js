const { listen } = window.__TAURI__.event;
const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

const appWindow = getCurrentWindow();

// Drag from titlebar
document.getElementById('titlebar').addEventListener('mousedown', (e) => {
  if (e.target.classList.contains('titlebar-btn')) return;
  appWindow.startDragging();
});

// Drag from main container too
document.querySelector('.container').addEventListener('mousedown', (e) => {
  if (e.target.tagName === 'BUTTON') return;
  appWindow.startDragging();
});

// Size cycling: S → M → L → S
const sizes = [
  { w: 180, h: 260, label: 'S' },
  { w: 260, h: 380, label: 'M' },
  { w: 340, h: 480, label: 'L' },
];
let sizeIdx = 1; // start at M

document.getElementById('btn-size').addEventListener('click', () => {
  sizeIdx = (sizeIdx + 1) % sizes.length;
  const { w, h } = sizes[sizeIdx];
  appWindow.setSize(new window.__TAURI__.dpi.LogicalSize(w, h));
  document.getElementById('btn-size').textContent = sizes[sizeIdx].label;
});

// Titlebar buttons
document.getElementById('btn-hide').addEventListener('click', () => {
  appWindow.minimize();
});
document.getElementById('btn-close').addEventListener('click', () => {
  appWindow.close();
});

const imgA = document.getElementById('img-a');
const imgB = document.getElementById('img-b');
const bubble = document.getElementById('bubble');
const lineEl = document.getElementById('line');
const statusEl = document.getElementById('status');

let currentFront = 'a';
let lastEmotion = '';
let lines = {};

async function init() {
  // Load lines.json via Rust
  try {
    const linesJson = await invoke('get_lines');
    lines = JSON.parse(linesJson);
  } catch (e) {
    console.warn('lines.json not loaded', e);
  }

  // Get initial state
  const state = await invoke('get_initial_state');
  if (state) updateEmotion(state);

  // Listen for updates from Rust watcher
  await listen('emotion-update', (event) => {
    updateEmotion(event.payload);
  });
}

function updateEmotion(data) {
  const { emotion, line, statusLine, imageData } = data;

  // Update image with crossfade
  if (emotion !== lastEmotion && imageData) {
    lastEmotion = emotion;

    const front = currentFront === 'a' ? imgA : imgB;
    const back = currentFront === 'a' ? imgB : imgA;

    back.onload = () => {
      front.classList.replace('visible', 'hidden');
      back.classList.replace('hidden', 'visible');
      currentFront = currentFront === 'a' ? 'b' : 'a';
    };
    back.src = imageData;
  }

  // Resolve line text: lines.json first, then state.json fallback
  const text = lines[emotion] || line || '';

  if (text || statusLine) {
    lineEl.textContent = text;
    statusEl.textContent = statusLine ? '(' + statusLine + ')' : '';
    bubble.classList.add('show');
  } else {
    bubble.classList.remove('show');
  }
}

init();

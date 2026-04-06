import { Editor } from './editor.js'

const importScreen = document.getElementById('import-screen')
const editorScreen = document.getElementById('editor-screen')
const importZone   = document.getElementById('import-zone')
const fileInput    = document.getElementById('file-input')

let editor = null

function showEditor() {
  importScreen.classList.remove('active')
  editorScreen.classList.add('active')
}

async function loadFile(file) {
  if (!file || !file.type.startsWith('video/')) {
    alert('Please select a video file.')
    return
  }
  showEditor()
  if (!editor) editor = new Editor()
  await editor.load(file)
}

// File input
fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadFile(e.target.files[0])
})

// Drag-and-drop
importZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  importZone.classList.add('drag-over')
})
importZone.addEventListener('dragleave', () => importZone.classList.remove('drag-over'))
importZone.addEventListener('drop', (e) => {
  e.preventDefault()
  importZone.classList.remove('drag-over')
  loadFile(e.dataTransfer.files[0])
})

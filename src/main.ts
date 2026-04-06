import { Editor } from './editor.js'

const importScreen     = document.getElementById('import-screen')!
const editorScreen     = document.getElementById('editor-screen')!
const importZone       = document.getElementById('import-zone')!
const fileInput        = document.getElementById('file-input') as HTMLInputElement
const btnShortcuts     = document.getElementById('btn-shortcuts')!
const shortcutsDialog  = document.getElementById('shortcuts-dialog') as HTMLDialogElement

btnShortcuts.addEventListener('click', () => shortcutsDialog.showModal())
// Close when clicking the backdrop (outside the panel box)
shortcutsDialog.addEventListener('click', (e) => {
  if (e.target === shortcutsDialog) shortcutsDialog.close()
})

let editor: Editor | null = null

function showEditor(): void {
  importScreen.classList.remove('active')
  editorScreen.classList.add('active')
}

async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith('video/')) {
    alert('Please select a video file.')
    return
  }
  showEditor()
  editor ??= new Editor()
  await editor.load(file)
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void loadFile(file)
})

importZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  importZone.classList.add('drag-over')
})
importZone.addEventListener('dragleave', () => importZone.classList.remove('drag-over'))
importZone.addEventListener('drop', (e) => {
  e.preventDefault()
  importZone.classList.remove('drag-over')
  const file = e.dataTransfer?.files[0]
  if (file) void loadFile(file)
})

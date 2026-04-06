/// <reference types="vite/client" />

// webkitAudioContext exists on Safari/older iOS
interface Window {
  webkitAudioContext?: typeof AudioContext
}

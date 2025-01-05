document.addEventListener("DOMContentLoaded", () => {
  const audioPlayer = document.getElementById("audio-player");
  const volumeIcon = document.getElementById("volume-icon");
  const volumeSlider = document.getElementById("volume-slider");

  const volumeOn = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
  <path d="M11 5.27L6.59 9H4a1 1 0 00-1 1v4a1 1 0 001 1h2.59L11 18.73a1 1 0 001.71-.71V6a1 1 0 00-1.71-.73zM14.83 7.17a1 1 0 011.41 0A7.17 7.17 0 0120 12a7.17 7.17 0 01-3.76 6.83 1 1 0 01-1.41-1.41A5.17 5.17 0 0018 12a5.17 5.17 0 00-2.76-4.42 1 1 0 01-.41-.41zm1.42-4.24a1 1 0 011.41 0A11.16 11.16 0 0124 12a11.16 11.16 0 01-6.34 9.83 1 1 0 01-1.41-1.41A9.16 9.16 0 0022 12a9.16 9.16 0 00-5.09-8.08 1 1 0 01-.66-.99z"/>
  </svg>
`;
const volumeOff = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
  <!-- Haut-parleur -->
  <path d="M9 7H5a1 1 0 00-1 1v8a1 1 0 001 1h4l5 4V3L9 7z" />
  <!-- Barre oblique -->
  <path d="M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
</svg>


`;

  // Configure initial volume and mute settings
  audioPlayer.volume = 0.2;
  audioPlayer.muted = false;

  // Play audio when page is loaded
//    audioPlayer.play().catch((error) => {
// 	 console.log("Lecture automatique bloquée par le navigateur :", error);
//    });

  // Mute/unmute on icon click
  volumeIcon.addEventListener("click", () => {
  audioPlayer.muted = !audioPlayer.muted;
  volumeIcon.innerHTML = audioPlayer.muted ? volumeOff : volumeOn;
  });

  // Update audio volume on slider change
  volumeSlider.addEventListener("input", (event) => {
  audioPlayer.volume = event.target.value / 100;
  audioPlayer.muted = audioPlayer.volume === 0;
  volumeIcon.innerHTML = audioPlayer.muted ? volumeOff : volumeOn;
  });

  // Unmute audio on first user interaction
  const unmuteOnFirstInteraction = () => {
  audioPlayer.muted = false;
  document.removeEventListener("click", unmuteOnFirstInteraction);
  document.removeEventListener("keydown", unmuteOnFirstInteraction);
  };
  document.addEventListener("click", unmuteOnFirstInteraction);
  document.addEventListener("keydown", unmuteOnFirstInteraction);

//   const volumeIcon = document.getElementById("volume-icon");





});
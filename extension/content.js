console.log("YouTube Song Liker Loaded");

let lastInjectedUrl = "";

function updateButtonState(btn, videoId) {
  chrome.storage.local.get({ songs: [] }, (data) => {
    const isAdded = data.songs.some(s => s.id === videoId);
    if (isAdded) {
      btn.innerText = "Already Added";
      btn.disabled = true;
    } else {
      btn.innerText = "Add to Song List";
      btn.disabled = false;
    }
  });
}

function injectButton() {
  const actionBar = document.querySelector("#top-level-buttons-computed, #segmented-like-button");
  if (!actionBar) {
    setTimeout(injectButton, 1000);
    return;
  }

  let btn = document.getElementById("yt-song-liker-btn");
  const videoId = new URLSearchParams(window.location.search).get("v");

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "yt-song-liker-btn";
    btn.className = "yt-spec-button-shape-next yt-spec-button-shape-next--outline yt-spec-button-shape-next--call-to-action yt-spec-button-shape-next--size-m";
    btn.style.marginLeft = "8px";

    btn.onclick = () => {
      const videoTitle = document.querySelector("h1.ytd-video-primary-info-renderer, ytd-watch-metadata h1")?.innerText;
      const videoUrl = window.location.href;
      const currentVideoId = new URLSearchParams(window.location.search).get("v");

      chrome.storage.local.get({ songs: [] }, (data) => {
        const songs = data.songs;
        if (!songs.some(s => s.id === currentVideoId)) {
          songs.push({
            id: currentVideoId,
            title: videoTitle,
            url: videoUrl,
            addedAt: new Date().toISOString()
          });
          chrome.storage.local.set({ songs });
        }
      });
    };

    const likeButton = document.querySelector("#segmented-like-button") || actionBar;
    likeButton.parentNode.insertBefore(btn, likeButton.nextSibling);
  }

  updateButtonState(btn, videoId);
}

// Sync button state if storage changes (e.g., removed from popup)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.songs) {
    const btn = document.getElementById("yt-song-liker-btn");
    const videoId = new URLSearchParams(window.location.search).get("v");
    if (btn && videoId) {
      updateButtonState(btn, videoId);
    }
  }
});

// Initial injection
injectButton();

// Handle SPA navigation
window.addEventListener("yt-navigate-finish", () => {
  injectButton();
});

// Re-check periodically in case YouTube UI updates
const observer = new MutationObserver(() => {
  const videoId = new URLSearchParams(window.location.search).get("v");
  if (videoId && !document.getElementById("yt-song-liker-btn")) {
    injectButton();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

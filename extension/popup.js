document.addEventListener("DOMContentLoaded", () => {
  const listElement = document.getElementById("song-list");
  const downloadAllBtn = document.getElementById("download-all-btn");
  const exportBtn = document.getElementById("export-btn");
  const clearBtn = document.getElementById("clear-btn");

  const BACKEND_URL = `${CONFIG.API_URL}/download`;

  function downloadSong(song) {
    const filename = `${song.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp3`;
    const url = `${BACKEND_URL}?v=${song.id}&title=${encodeURIComponent(song.title)}`;
    
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function loadSongs() {
    chrome.storage.local.get({ songs: [] }, (data) => {
      listElement.innerHTML = "";
      if (data.songs.length === 0) {
        listElement.innerHTML = "<li class='song-item'>No songs added yet.</li>";
        exportBtn.disabled = true;
        downloadAllBtn.disabled = true;
        return;
      }
      exportBtn.disabled = false;
      downloadAllBtn.disabled = false;
      
      data.songs.reverse().forEach((song) => {
        const li = document.createElement("li");
        li.className = "song-item";
        li.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="flex: 1; overflow: hidden; cursor: pointer;" class="song-info" data-id="${song.id}">
              <div class="song-title">${song.title}</div>
              <div class="song-date">${new Date(song.addedAt).toLocaleString()}</div>
            </div>
            <div style="display: flex; align-items: center;">
              <button class="dl-btn" data-id="${song.id}" style="background: none; border: none; color: #3ea6ff; cursor: pointer; font-size: 16px; padding: 0 8px;">⬇️</button>
              <button class="remove-btn" data-id="${song.id}" style="background: none; border: none; color: #ff4e4e; cursor: pointer; font-size: 18px; padding: 0 8px;">&times;</button>
            </div>
          </div>
        `;
        listElement.appendChild(li);
      });

      // Add click listeners to download buttons
      document.querySelectorAll(".dl-btn").forEach(btn => {
        btn.onclick = (e) => {
          const id = e.target.getAttribute("data-id");
          const song = data.songs.find(s => s.id === id);
          if (song) downloadSong(song);
        };
      });

      // Add click listeners to remove buttons
      document.querySelectorAll(".remove-btn").forEach(btn => {
        btn.onclick = (e) => {
          const idToRemove = e.target.getAttribute("data-id");
          chrome.storage.local.get({ songs: [] }, (currentData) => {
            const updatedSongs = currentData.songs.filter(s => s.id !== idToRemove);
            chrome.storage.local.set({ songs: updatedSongs }, () => {
              loadSongs();
            });
          });
        };
      });
    });
  }

  downloadAllBtn.onclick = () => {
    chrome.storage.local.get({ songs: [] }, (data) => {
      const songsEncoded = encodeURIComponent(JSON.stringify(data.songs));
      const managerUrl = `${CONFIG.API_URL}/index.html?songs=${songsEncoded}`;
      window.open(managerUrl, '_blank');
    });
  };

  exportBtn.onclick = () => {
    chrome.storage.local.get({ songs: [] }, (data) => {
      const blob = new Blob([JSON.stringify(data.songs, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `youtube_songs_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  clearBtn.onclick = () => {
    if (confirm("Are you sure you want to clear your song list?")) {
      chrome.storage.local.set({ songs: [] }, () => {
        loadSongs();
      });
    }
  };

  loadSongs();
});

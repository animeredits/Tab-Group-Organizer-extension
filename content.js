function getFaviconColor(faviconUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous"; // Enable CORS for the image
      img.src = faviconUrl;
      img.onload = () => {
        const color = extractDominantColor(img); // Use your existing extract function
        resolve(color);
      };
    });
  }
  
  // Usage
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getFavicon") {
      const faviconLink = document.querySelector("link[rel*='icon']") || document.querySelector("link[rel='shortcut icon']");
      const faviconUrl = faviconLink ? faviconLink.href : 'icon.png'; // Replace with your default favicon URL
      getFaviconColor(faviconUrl).then((color) => {
        sendResponse({ faviconUrl, color });
      });
      return true; // Keep the messaging channel open for sendResponse
    }
  });
  
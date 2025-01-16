// Centralized error handling function
function handleError(error, context) {
  // Log error to console with context information
  console.error(`Error in ${context}:`, error);
  // Here you could also implement logic to store errors in chrome.storage
}

// Listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  try {
    // Check for existing settings
    const { extensionEnabled, autoMergeTabs } = await chrome.storage.sync.get([
      "extensionEnabled",
      "autoMergeTabs",
    ]);

    // Set default values if not already set
    if (extensionEnabled === undefined) {
      await chrome.storage.sync.set({ extensionEnabled: true }); // Default to enabled
    }

    if (autoMergeTabs === undefined) {
      await chrome.storage.sync.set({ autoMergeTabs: true }); // Default to enabled on install
    }

    // Optionally, you can also trigger the auto-merge logic here if needed
    if (autoMergeTabs) {
      autoMergeTabsOnInstall(); // Define this function to perform auto-merge logic
    }
  } catch (error) {
    handleError(error, "onInstalled");
  }
});

// Function to auto-merge tabs on installation
async function autoMergeTabsOnInstall() {
  try {
    chrome.tabs.query({}, (tabs) => {
      const domainMap = new Map();

      tabs.forEach((tab) => {
        if (isValidUrl(tab.url)) {
          try {
            const url = new URL(tab.url);
            const domain = getMainDomain(url.hostname);

            if (!domainMap.has(domain)) {
              domainMap.set(domain, []);
            }
            domainMap.get(domain).push(tab);
          } catch (e) {
            handleError(e, "Processing tab URL in autoMergeTabsOnInstall");
          }
        }
      });

      // Iterate over the domain map to group tabs
      domainMap.forEach((sameSiteTabs, domain) => {
        if (sameSiteTabs.length > 2) {
          handleTabGrouping(sameSiteTabs, domain); // Call your grouping logic
        }
      });
    });
  } catch (error) {
    handleError(error, "autoMergeTabsOnInstall");
  }
}

chrome.tabs.onCreated.addListener(handleTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    handleTab(tab);
  }
});

async function handleTab(tab) {
  // Check for invalid URLs (e.g., about:blank, chrome://newtab)
  if (!isValidUrl(tab.url)) {
    return; // Return early if the URL is invalid
  }

  try {
    const url = new URL(tab.url); // This will succeed if the URL is valid
    const domain = getMainDomain(url.hostname);

    // Check if the extension is enabled
    const isEnabled = await isExtensionEnabled();
    if (!isEnabled) return; // Extension is disabled, do nothing

    // Get the window ID of the current tab
    const currentWindowId = tab.windowId;

    chrome.tabs.query({}, async (tabs) => {
      const sameSiteTabs = getSameSiteTabs(tabs, domain);
      const sameWindowTabs = sameSiteTabs.filter(t => t.windowId === currentWindowId);

      if (sameWindowTabs.length > 2) {
        const { autoMergeTabs } = await chrome.storage.sync.get("autoMergeTabs"); // Get autoMergeTabs from storage
        // Only proceed with grouping if autoMergeTabs is enabled
        if (autoMergeTabs) {
          handleTabGrouping(sameWindowTabs, domain);
        }
      }
    });
  } catch (error) {
    handleError(error, "handleTab");
  }
}

function getSameSiteTabs(tabs, domain) {
  return tabs.filter((t) => {
    if (!isValidUrl(t.url)) return false;

    try {
      const tabDomain = getMainDomain(new URL(t.url).hostname);
      return tabDomain === domain;
    } catch (e) {
      handleError(e, "getSameSiteTabs");
      return false; // Skip if URL construction fails
    }
  });
}

async function handleTabGrouping(sameSiteTabs, domain) {
  const customGroupTabs = sameSiteTabs.filter(
    (t) => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
  );

  if (customGroupTabs.length > 0) {
    const customGroupId = customGroupTabs[0].groupId;
    mergeTabsIntoGroup(customGroupId, sameSiteTabs);
  } else {
    groupTabs(sameSiteTabs, domain);
  }
}

function mergeTabsIntoGroup(groupId, tabs) {
  // Check if the groupId is valid before attempting to merge
  chrome.tabGroups.get(groupId)
    .then(() => {
      chrome.tabs.group({
        groupId,
        tabIds: tabs.map((t) => t.id),
      });
    })
    .catch((error) => {
      // If the group does not exist, log the error and handle it gracefully
      handleError(error, "mergeTabsIntoGroup - group ID does not exist");
      // Optionally, you could create a new group here or take other actions
    });
}

function groupTabs(tabs, domain) {
  const groupColor = mapColorToTabGroupColor(domain);
  
  chrome.tabs.group(
    {
      tabIds: tabs.map((t) => t.id),
    },
    (newGroupId) => {
      if (chrome.runtime.lastError) {
        // Handle the case where grouping failed (like if the group ID was invalid)
        handleError(chrome.runtime.lastError, "groupTabs - grouping failed");
        return; // Exit if there was an error
      }

      chrome.tabGroups.update(newGroupId, { title: toSentenceCase(domain), color: groupColor })
        .then(() => updateTabGroups(tabs[0], newGroupId))
        .catch((error) => {
          handleError(error, "groupTabs - updating group failed");
        });
    }
  );
}

function isValidUrl(url) {
  return url && !url.startsWith("chrome://") && url !== "about:blank";
}

function getMainDomain(hostname) {
  return hostname.replace("www.", "").split(".")[0];
}

function toSentenceCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Check if the extension is enabled
async function isExtensionEnabled() {
  const { extensionEnabled } = await chrome.storage.sync.get("extensionEnabled");
  return extensionEnabled !== false; // Return true if enabled, false if disabled
}

// Handle merging new site tabs into existing groups
async function updateTabGroups(tab) {
  const { autoMergeTabs } = await chrome.storage.sync.get("autoMergeTabs"); // Get autoMergeTabs from storage

  // Proceed only if autoMergeTabs is enabled
  if (autoMergeTabs) {
    try {
      const url = new URL(tab.url);
      const siteName = url.hostname.replace(/^www\./, ""); // Get main site name, remove 'www'

      // Get existing groups to find a match
      const groups = await chrome.tabGroups.query({});
      const matchingGroup = groups.find(
        (group) => group.title.toLowerCase() === siteName.toLowerCase()
      );

      if (matchingGroup) {
        // Move the tab to the matching group
        await chrome.tabs.group({
          groupId: matchingGroup.id,
          tabIds: [tab.id],
        });
      } else {
        // Create a new group if no match found
        const newGroupId = await chrome.tabGroups.create({ title: siteName });
        await chrome.tabs.group({ groupId: newGroupId.id, tabIds: [tab.id] });
      }
    } catch (error) {
      handleError(error, "updateTabGroups");
    }
  }
}

// Listen for storage changes to handle toggling
chrome.storage.onChanged.addListener((changes) => {
  if (changes.extensionEnabled) {
    console.log("Extension enabled state changed:", changes.extensionEnabled.newValue);
  }
});

// Map extracted color to a valid tab group color
function mapColorToTabGroupColor(domain) {
  const colorMap = {
    "instagram": "pink",
    "chatgpt": "lightblue",
    "youtube": "darkred",
    "facebook": "blue",
    "flipkart": "yellow",
  };

  // Normalize the domain to lower case for matching
  const normalizedDomain = domain.toLowerCase();

  return colorMap[normalizedDomain] || getRandomValidTabGroupColor(); // Fallback to random valid color
}

// Get a random valid tab group color
function getRandomValidTabGroupColor() {
  const colors = [
    "blue",
    "cyan",
    "green",
    "grey",
    "orange",
    "pink",
    "purple",
    "red",
    "yellow",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Extract dominant color from imageBitmap
function extractDominantColor(imageBitmap) {
  const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
  const context = canvas.getContext("2d");
  context.drawImage(imageBitmap, 0, 0);

  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let r = 0, g = 0, b = 0, count = 0;

  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }

  // If no pixels were counted, return null
  if (count === 0) return null;

  return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
}

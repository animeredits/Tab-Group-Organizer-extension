document.addEventListener("DOMContentLoaded", () => {
    const toggleExtension = document.getElementById("toggleExtension");
    const autoMerge = document.getElementById("autoMerge");

    // Load current settings
    chrome.storage.sync.get(["extensionEnabled", "autoMergeTabs"], (data) => {
        const extensionEnabled = data.extensionEnabled !== undefined ? data.extensionEnabled : true; // Default to enabled
        const autoMergeTabs = data.autoMergeTabs !== undefined ? data.autoMergeTabs : true; // Default to disabled

        // Update button states
        updateToggleButton(toggleExtension, extensionEnabled);
        updateAutoMergeButton(autoMerge, autoMergeTabs);
    });

    // Save settings on toggle button click
    toggleExtension.addEventListener("click", () => {
        const isEnabled = toggleExtension.classList.toggle("disabled");
        toggleExtension.textContent = isEnabled ? "Enable Extension" : "Disable Extension";

        chrome.storage.sync.set({ extensionEnabled: !isEnabled }, () => {
            console.log("Extension enabled state:", !isEnabled); // Log for debugging

            
        });
    });

    // Save settings on auto merge button click
    autoMerge.addEventListener("click", () => {
        const isAutoMergeEnabled = autoMerge.classList.toggle("disabled");
        autoMerge.textContent = isAutoMergeEnabled ? "Auto Merge: Enabled" : "Auto Merge: Disabled";

        chrome.storage.sync.set({ autoMergeTabs: !isAutoMergeEnabled }, () => {
            console.log("Auto merge state:", !isAutoMergeEnabled); // Log for debugging
        });
    });

    function updateToggleButton(button, isEnabled) {
        button.classList.toggle("disabled", !isEnabled);
        button.textContent = isEnabled ? "Disable Extension" : "Enable Extension";
        button.disabled = false; // Enable the button after loading
    }

    function updateAutoMergeButton(button, isEnabled) {
        button.classList.toggle("disabled", !isEnabled);
        button.textContent = isEnabled ? "Auto Merge: Disable" : "Auto Merge: Enabled";
        button.disabled = false; // Enable the button after loading
    }


});

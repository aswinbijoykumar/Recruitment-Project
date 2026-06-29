// =============================================
// RecruitOps — Frontend Controller
// =============================================

// --- Character counter ---
const clientInput = document.getElementById("clientDemands");
const charCounter = document.getElementById("charCount");

clientInput.addEventListener("input", () => {
    const len = clientInput.value.length;
    charCounter.textContent = `${len} character${len !== 1 ? "s" : ""}`;
});

// --- Copy to clipboard ---
function copyOutput() {
    const outputText = document.getElementById("jdOutput").innerText;
    if (!outputText.trim()) return;

    navigator.clipboard.writeText(outputText).then(() => {
        const btn = document.getElementById("copyBtn");
        const icon = document.getElementById("copyIcon");
        const label = document.getElementById("copyLabel");

        btn.classList.add("copied");
        icon.textContent = "✅";
        label.textContent = "Copied!";

        setTimeout(() => {
            btn.classList.remove("copied");
            icon.textContent = "📋";
            label.textContent = "Copy";
        }, 2000);
    });
}

// --- Status indicator helpers ---
function setStatus(state, text) {
    const dot = document.getElementById("statusDot");
    const label = document.getElementById("statusLabel");

    dot.className = "status-dot";
    if (state === "processing") dot.classList.add("processing");
    if (state === "error") dot.classList.add("error");

    label.textContent = text;
}

// --- Main submission handler ---
async function submitClientDemands() {
    const inputField = document.getElementById("clientDemands");
    const outputContainer = document.getElementById("outputContainer");
    const outputWindow = document.getElementById("jdOutput");
    const actionButton = document.getElementById("generateBtn");
    const engineSelect = document.getElementById("engineSelect");

    const textValue = inputField.value.trim();
    if (!textValue) {
        // Briefly shake the textarea to indicate empty input
        inputField.style.animation = "none";
        inputField.offsetHeight; // trigger reflow
        inputField.style.animation = "shake 0.4s ease";
        setTimeout(() => { inputField.style.animation = "none"; }, 500);
        return;
    }

    // Configure UI for processing state
    actionButton.disabled = true;
    actionButton.classList.add("loading");
    outputWindow.innerText = "";
    outputContainer.classList.add("visible");
    setStatus("processing", "Generating…");

    try {
        const response = await fetch('/api/generate-jd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                demands: textValue,
                engine: engineSelect.value 
            })
        });

        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }

        // Stream tokens from the response body
        const reader = response.body.getReader();
        const textDecoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const textToken = textDecoder.decode(value);
            outputWindow.innerText += textToken;

            // Auto-scroll to the bottom as tokens arrive
            outputWindow.scrollTop = outputWindow.scrollHeight;
        }

        setStatus("ready", "Generation Complete");
        // After 4 seconds, revert to idle status
        setTimeout(() => setStatus("ready", "System Ready"), 4000);

    } catch (error) {
        outputWindow.innerText = `⚠ Generation failed.\n\nDetails: ${error.message}\n\nPlease check that Ollama is running and the jd-generator model is available.`;
        setStatus("error", "Error Occurred");
        setTimeout(() => setStatus("ready", "System Ready"), 6000);
    } finally {
        actionButton.disabled = false;
        actionButton.classList.remove("loading");
    }
}

// --- Inject shake keyframe dynamically ---
const shakeStyle = document.createElement("style");
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20%      { transform: translateX(-6px); }
        40%      { transform: translateX(6px); }
        60%      { transform: translateX(-4px); }
        80%      { transform: translateX(4px); }
    }
`;
document.head.appendChild(shakeStyle);
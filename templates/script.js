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

    const textValue = inputField.value.trim();

    if (!textValue) {
        alert("Error: Input window cannot be submitted empty.");
        return;
    }

    actionButton.disabled = true;
    actionButton.innerText = "Processing Pipeline...";
    outputWindow.innerText = ""; 
    outputContainer.style.display = "block";

    try {
        // Send clean payload with only the required client demands text string
        const response = await fetch('/api/generate-jd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ demands: textValue }) // Dropped engine property
        });

        if (!response.ok) {
            throw new Error("API communication pipeline broke or returned an error status.");
        }

        const reader = response.body.getReader();
        const textDecoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const textToken = textDecoder.decode(value);
            outputWindow.innerText += textToken;
        }

    } catch (error) {
        outputWindow.innerText = `[CRITICAL ERROR] Execution pipeline failed. Details: ${error.message}`;
    } finally {
        actionButton.disabled = false;
        actionButton.innerText = "Compile Job Description";
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
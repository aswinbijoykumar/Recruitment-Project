// =============================================
// Protiviti HR Portal — Frontend Controller
// =============================================

// --- Character counter ---
const clientInput = document.getElementById("clientDemands");
const charCounter  = document.getElementById("charCount");

clientInput.addEventListener("input", () => {
    const len = clientInput.value.length;
    charCounter.textContent = `${len} character${len !== 1 ? "s" : ""}`;
});

// --- Sidebar Toggle ---
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("collapsed");
}

// --- New Chat ---
function newChat() {
    // Clear input
    document.getElementById("clientDemands").value = "";
    charCounter.textContent = "0 characters";

    // Hide output
    const output = document.getElementById("outputContainer");
    output.classList.remove("visible");
    document.getElementById("jdOutput").textContent = "";
    document.getElementById("outputMeta").textContent = "Ready";

    // Reset stats
    document.getElementById("tokenCount").textContent = "—";
    document.getElementById("timeCount").textContent  = "—";

    // Reset status
    setStatus("ready", "System Ready");

    // Scroll back to top
    document.getElementById("contentArea").scrollTo({ top: 0, behavior: "smooth" });

    // Focus textarea
    setTimeout(() => clientInput.focus(), 300);
}

// --- Status Helpers ---
function setStatus(state, text) {
    const dot   = document.getElementById("statusDot");
    const label = document.getElementById("statusLabel");
    dot.className = "status-dot";
    if (state === "processing") dot.classList.add("processing");
    if (state === "error")      dot.classList.add("error");
    label.textContent = text;
}

// =============================================
// SAVED JDs — SQLite backed
// =============================================

async function saveJD() {
    const demands = document.getElementById("clientDemands").value.trim();
    const jdText  = document.getElementById("jdOutput").textContent.trim();

    if (!jdText) { alert("No JD to save yet — generate one first."); return; }

    const saveBtn   = document.getElementById("saveJdBtn");
    const saveLabel = document.getElementById("saveLabel");
    saveBtn.disabled = true;
    saveLabel.textContent = "Saving…";

    try {
        const res  = await fetch("/api/save-jd", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ demands, jd_text: jdText })
        });
        if (!res.ok) throw new Error("Save failed");

        // Flash success state
        saveBtn.classList.add("saved");
        saveLabel.textContent = "Saved!";
        setTimeout(() => {
            saveBtn.classList.remove("saved");
            saveLabel.textContent = "Save JD";
            saveBtn.disabled = false;
        }, 2500);

        // Refresh sidebar list
        await loadSavedJDs();

    } catch (err) {
        alert("Could not save: " + err.message);
        saveLabel.textContent = "Save JD";
        saveBtn.disabled = false;
    }
}

async function loadSavedJDs() {
    try {
        const res  = await fetch("/api/saved-jds");
        const list = await res.json();
        renderSavedJDs(list);
    } catch (_) {
        // silently fail — sidebar will just show empty state
    }
}

function renderSavedJDs(list) {
    const container = document.getElementById("savedJdList");
    const emptyEl   = document.getElementById("savedJdEmpty");

    // Remove any previously rendered cards (keep the empty state node)
    Array.from(container.querySelectorAll(".saved-jd-card")).forEach(el => el.remove());

    if (!list || list.length === 0) {
        emptyEl.style.display = "flex";
        return;
    }
    emptyEl.style.display = "none";

    list.forEach(jd => {
        const card = document.createElement("div");
        card.className = "saved-jd-card";
        card.dataset.id = jd.id;

        // Format date
        const date = new Date(jd.created_at + "Z");
        const dateStr = date.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });

        // Keywords: skip the first (it's the title), show the rest as pills
        const kwTags = (jd.keywords || []).slice(1, 5).map(
            kw => `<span class="saved-jd-kw">${kw}</span>`
        ).join("");

        card.innerHTML = `
            <div class="saved-jd-card-title">${escHtml(jd.title)}</div>
            <div class="saved-jd-card-date">${dateStr}</div>
            ${kwTags ? `<div class="saved-jd-keywords">${kwTags}</div>` : ""}
            <button class="saved-jd-delete" data-id="${jd.id}" title="Delete">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>`;

        // Click card body → load JD
        card.addEventListener("click", (e) => {
            if (e.target.closest(".saved-jd-delete")) return;
            loadJD(jd.id);
        });

        // Click delete button
        card.querySelector(".saved-jd-delete").addEventListener("click", (e) => {
            e.stopPropagation();
            deleteSavedJD(jd.id, card);
        });

        container.appendChild(card);
    });
}

async function loadJD(id) {
    try {
        const res = await fetch(`/api/saved-jds/${id}`);
        if (!res.ok) throw new Error("Not found");
        const jd = await res.json();

        // Populate the client demands textarea
        const textarea = document.getElementById("clientDemands");
        textarea.value = jd.demands;
        textarea.dispatchEvent(new Event("input"));

        // Show the JD in the output card
        const outputContainer = document.getElementById("outputContainer");
        const jdOutput        = document.getElementById("jdOutput");
        const outputMeta      = document.getElementById("outputMeta");
        jdOutput.textContent  = jd.jd_text;
        outputContainer.classList.add("visible");
        if (outputMeta) outputMeta.textContent = `Loaded from saved JDs · ${jd.title}`;

        // Scroll to top so user sees the textarea
        document.getElementById("contentArea").scrollTo({ top: 0, behavior: "smooth" });

    } catch (err) {
        alert("Could not load JD: " + err.message);
    }
}

async function deleteSavedJD(id, cardEl) {
    if (!confirm("Delete this saved JD? This cannot be undone.")) return;
    try {
        const res = await fetch(`/api/saved-jds/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        cardEl.style.opacity = "0";
        cardEl.style.transform = "translateX(-10px)";
        cardEl.style.transition = "all 0.2s ease";
        setTimeout(async () => {
            cardEl.remove();
            await loadSavedJDs(); // re-render to show empty state if needed
        }, 200);
    } catch (err) {
        alert("Could not delete: " + err.message);
    }
}



// --- Copy to Clipboard ---
function copyOutput() {
    const text = document.getElementById("jdOutput").textContent;
    if (!text.trim()) return;

    const copyBtn   = document.getElementById("copyBtn");
    const copyLabel = document.getElementById("copyLabel");

    const doSuccess = () => {
        copyBtn.classList.add("copied");
        copyLabel.textContent = "Copied!";
        setTimeout(() => {
            copyBtn.classList.remove("copied");
            copyLabel.textContent = "Copy";
        }, 2000);
    };

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(doSuccess);
    } else {
        // HTTP fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity  = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        doSuccess();
    }
}

// --- Export .txt ---
function exportOutput() {
    const text = document.getElementById("jdOutput").textContent;
    if (!text.trim()) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "Protiviti_JD_" + Date.now() + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Main Submission Handler ---
async function submitClientDemands() {
    const textValue = clientInput.value.trim();
    if (!textValue) {
        alert("Please enter your requirements or select a quick template.");
        return;
    }

    const outputContainer = document.getElementById("outputContainer");
    const outputWindow    = document.getElementById("jdOutput");
    const actionButton    = document.getElementById("generateBtn");
    const outputMeta      = document.getElementById("outputMeta");
    const tokenDisplay    = document.getElementById("tokenCount");
    const timeDisplay     = document.getElementById("timeCount");

    // Update UI state
    actionButton.disabled = true;
    actionButton.classList.add("loading");
    outputWindow.textContent = "";

    outputContainer.classList.add("visible");
    setStatus("processing", "Generating…");
    tokenDisplay.textContent = "0";
    timeDisplay.textContent  = "0.0s";

    // Smooth scroll to output
    setTimeout(() => {
        outputContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);

    // Timer
    const startTime = Date.now();
    let timerInterval = setInterval(() => {
        timeDisplay.textContent = ((Date.now() - startTime) / 1000).toFixed(1) + "s";
    }, 100);

    try {
        const response = await fetch("/api/generate-jd", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ demands: textValue })
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const reader      = response.body.getReader();
        const textDecoder = new TextDecoder("utf-8");
        let totalBytes    = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = textDecoder.decode(value, { stream: true });
            outputWindow.textContent += chunk;
            totalBytes += value.length;
            tokenDisplay.textContent = Math.round(totalBytes / 4);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (outputMeta) outputMeta.textContent = `Generated in ${elapsed}s · ~${Math.round(totalBytes / 4)} tokens`;
        setStatus("ready", "System Ready");

    } catch (error) {
        outputWindow.textContent = `[Error] ${error.message}\n\nPlease ensure the server is running and your Groq API key is valid in the .env file.`;
        setStatus("error", "Error");
    } finally {
        actionButton.disabled = false;
        actionButton.classList.remove("loading");
        clearInterval(timerInterval);
    }
}

// =============================================
// RESUME ANALYZER — wired via addEventListener
// (no inline handlers in HTML to avoid timing errors)
// =============================================

let selectedResumeFile = null;

// Wire up everything once the DOM is ready
document.addEventListener("DOMContentLoaded", function () {

    // Load saved JDs into sidebar on startup
    loadSavedJDs();

    const dropZone       = document.getElementById("dropZone");
    const fileInput      = document.getElementById("resumeFileInput");
    const fileRemoveBtn  = document.getElementById("fileRemoveBtn");

    if (!dropZone || !fileInput) return; // guard if elements don't exist

    // Click on the drop zone → open file picker (ignore clicks on the remove button)
    dropZone.addEventListener("click", function (e) {
        if (e.target.closest("#fileRemoveBtn")) return;
        fileInput.click();
    });

    // File selected via picker
    fileInput.addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (file) setResumeFile(file);
    });

    // Drag events
    dropZone.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", function (e) {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove("drag-over");
        const file = e.dataTransfer.files[0];
        if (file) setResumeFile(file);
    });

    // Remove file button
    if (fileRemoveBtn) {
        fileRemoveBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            clearFile();
        });
    }
});

function setResumeFile(file) {
    const allowed = [".pdf", ".txt"];
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!allowed.includes(ext)) {
        alert("Unsupported file type. Please upload a PDF or TXT resume.");
        return;
    }
    selectedResumeFile = file;
    document.getElementById("fileInfo").style.display = "flex";
    document.getElementById("fileName").textContent   = file.name;
    document.getElementById("analyzeBtn").disabled    = false;
}

function clearFile() {
    selectedResumeFile = null;
    document.getElementById("fileInfo").style.display   = "none";
    document.getElementById("resumeFileInput").value    = "";
    document.getElementById("analyzeBtn").disabled      = true;
}

// --- Main Analyze Function ---
async function analyzeResume() {
    const jdText = document.getElementById("jdOutput").textContent.trim();

    if (!jdText) {
        const warning = document.getElementById("analyzerWarning");
        warning.style.display = "flex";
        setTimeout(() => { warning.style.display = "none"; }, 4000);
        return;
    }

    if (!selectedResumeFile) {
        alert("Please upload a resume file first.");
        return;
    }

    const analyzeBtn   = document.getElementById("analyzeBtn");
    const resultCard   = document.getElementById("analysisResultCard");
    const analysisOut  = document.getElementById("analysisOutput");
    const analysisMeta = document.getElementById("analysisMeta");

    analyzeBtn.disabled = true;
    analyzeBtn.classList.add("loading");

    // Show streaming placeholder
    analysisOut.innerHTML = '<div class="analysis-streaming">Analyzing resume against the job description…</div>';
    resultCard.classList.add("visible");

    setTimeout(() => {
        resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);

    const startTime = Date.now();

    try {
        const formData = new FormData();
        formData.append("jd_text",     jdText);
        formData.append("resume_file", selectedResumeFile, selectedResumeFile.name);

        const response = await fetch("/api/analyze-resume", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
            throw new Error(err.detail || `Server error ${response.status}`);
        }

        // Stream the full text into a buffer
        const reader      = response.body.getReader();
        const textDecoder = new TextDecoder("utf-8");
        let fullText      = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += textDecoder.decode(value, { stream: true });
        }

        // Render as styled HTML
        analysisOut.innerHTML = renderAnalysisReport(fullText);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (analysisMeta) analysisMeta.textContent = `Analysis completed in ${elapsed}s · ${selectedResumeFile.name}`;

    } catch (error) {
        analysisOut.innerHTML = `<div class="analysis-streaming" style="color:var(--red-err)">[Error] ${error.message}</div>`;
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.classList.remove("loading");
    }
}

// --- Analysis Report Renderer ---
function renderAnalysisReport(rawText) {
    // Clean up any stray markdown characters
    const clean = rawText
        .replace(/#{1,6}\s*/g, "")   // remove ### headings
        .replace(/\*\*/g, "")         // remove bold **
        .replace(/\*/g, "")           // remove italic *
        .replace(/[\u{1F300}-\u{1FFFF}]/gu, "") // remove emojis
        .trim();

    const lines = clean.split("\n").map(l => l.trimEnd());

    // Detect which section each line belongs to
    const SECTIONS = {
        "OVERALL MATCH SCORE": "score",
        "STRENGTHS":           "strengths",
        "GAPS":                "gaps",
        "SECTION ASSESSMENT":  "assessment",
        "RECOMMENDATION":      "recommendation"
    };

    let html        = "";
    let currentSec  = null;
    let sectionBuf  = [];

    const flushSection = (sec, buf) => {
        if (!sec || buf.length === 0) return "";
        const contentLines = buf.filter(l => l.trim() !== "");
        if (contentLines.length === 0) return "";
        return buildSectionHTML(sec, contentLines);
    };

    for (const line of lines) {
        const upperLine = line.trim().toUpperCase();
        const secKey    = Object.keys(SECTIONS).find(k => upperLine === k);

        if (secKey) {
            html       += flushSection(currentSec, sectionBuf);
            currentSec  = SECTIONS[secKey];
            sectionBuf  = [];
        } else {
            sectionBuf.push(line);
        }
    }
    html += flushSection(currentSec, sectionBuf);

    return html || `<div class="analysis-streaming">${clean}</div>`;
}

function buildSectionHTML(section, lines) {
    if (section === "score") {
        return buildScoreHTML(lines);
    }
    if (section === "strengths" || section === "gaps") {
        return buildBulletsHTML(section, lines);
    }
    if (section === "assessment") {
        return buildAssessmentHTML(lines);
    }
    if (section === "recommendation") {
        return buildRecommendationHTML(lines);
    }
    return "";
}

function buildScoreHTML(lines) {
    let scoreText   = "";
    let verdictText = "";
    let summaryText = "";

    for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        if (l.toLowerCase().includes("match score") || l.match(/\d+\s*\/\s*100/)) {
            scoreText = l.replace(/match score[:\s]*/i, "").trim();
        } else if (/strong match|moderate match|weak match/i.test(l)) {
            verdictText = l;
        } else {
            summaryText += (summaryText ? " " : "") + l;
        }
    }

    const verdictClass = /strong/i.test(verdictText) ? "strong" :
                         /moderate/i.test(verdictText) ? "moderate" : "weak";

    return `
    <div class="report-score-banner">
        <div class="report-score-left">
            <span class="report-score-label">Match Score</span>
            <span class="report-score-value">${scoreText || "—"}</span>
            ${summaryText ? `<span class="report-score-summary">${summaryText}</span>` : ""}
        </div>
        <span class="report-verdict ${verdictClass}">${verdictText || "Result"}</span>
    </div>`;
}

function buildBulletsHTML(section, lines) {
    const isStrengths = section === "strengths";
    const label  = isStrengths ? "Strengths" : "Gaps";
    const svgIcon = isStrengths
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    const bullets = lines
        .filter(l => l.trim())
        .map(l => l.replace(/^[-•]\s*/, "").trim())
        .filter(Boolean);

    const items = bullets.map(b =>
        `<div class="report-bullet">
            <span class="report-bullet-dot"></span>
            <span class="report-bullet-text">${escHtml(b)}</span>
        </div>`
    ).join("");

    return `
    <div class="report-section ${section}">
        <div class="report-section-header">${svgIcon} ${label}</div>
        <div class="report-section-body">${items}</div>
    </div>`;
}

function buildAssessmentHTML(lines) {
    const rows = lines
        .filter(l => l.includes(":"))
        .map(l => {
            const colonIdx = l.indexOf(":");
            const key = l.slice(0, colonIdx).trim();
            const val = l.slice(colonIdx + 1).trim();
            return key && val
                ? `<div class="assessment-row">
                    <span class="assessment-key">${escHtml(key)}</span>
                    <span class="assessment-val">${escHtml(val)}</span>
                   </div>`
                : "";
        }).join("");

    const svgIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
    return `
    <div class="report-section assessment">
        <div class="report-section-header">${svgIcon} Section Assessment</div>
        <div class="report-section-body">${rows}</div>
    </div>`;
}

function buildRecommendationHTML(lines) {
    const text = lines.filter(l => l.trim()).join(" ");
    const svgIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    return `
    <div class="report-section recommendation">
        <div class="report-section-header">${svgIcon} Recommendation</div>
        <div class="report-section-body">
            <p class="report-recommendation-text">${escHtml(text)}</p>
        </div>
    </div>`;
}

function escHtml(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// --- Copy Analysis Result ---
function copyAnalysis() {
    const text = document.getElementById("analysisOutput").textContent;
    if (!text.trim()) return;

    const btn   = document.getElementById("copyAnalysisBtn");
    const label = document.getElementById("copyAnalysisLabel");

    const doSuccess = () => {
        btn.classList.add("copied");
        label.textContent = "Copied!";
        setTimeout(() => { btn.classList.remove("copied"); label.textContent = "Copy"; }, 2000);
    };

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(doSuccess);
    } else {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
        doSuccess();
    }
}
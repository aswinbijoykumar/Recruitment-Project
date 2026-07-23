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

let uploadedResumeFiles = [];
let batchAnalysisData   = null; // stores the API response data

// Wire up everything once the DOM is ready
document.addEventListener("DOMContentLoaded", function () {

    // Load saved JDs into sidebar on startup
    loadSavedJDs();

    const dropZone  = document.getElementById("dropZone");
    const fileInput = document.getElementById("resumeFileInput");

    if (!dropZone || !fileInput) return; // guard if elements don't exist

    // Click on the drop zone → open file picker
    dropZone.addEventListener("click", function (e) {
        if (e.target.closest("#filesContainer")) return; // ignore if clicking inside files container
        fileInput.click();
    });

    // Files selected via picker
    fileInput.addEventListener("change", function (e) {
        if (e.target.files.length > 0) {
            addResumeFiles(e.target.files);
        }
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
        if (e.dataTransfer.files.length > 0) {
            addResumeFiles(e.dataTransfer.files);
        }
    });
});

function addResumeFiles(files) {
    const allowed = [".pdf", ".txt"];
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = "." + file.name.split(".").pop().toLowerCase();
        
        if (!allowed.includes(ext)) {
            alert(`Unsupported file: ${file.name}. Please upload PDF or TXT files.`);
            continue;
        }
        
        // Avoid duplicate files by name
        if (!uploadedResumeFiles.some(f => f.name === file.name)) {
            uploadedResumeFiles.push(file);
        }
    }
    
    renderFilesList();
}

function renderFilesList() {
    const container = document.getElementById("filesContainer");
    const analyzeBtn = document.getElementById("analyzeBtn");
    
    if (uploadedResumeFiles.length === 0) {
        container.style.display = "none";
        container.innerHTML = "";
        analyzeBtn.disabled = true;
        return;
    }
    
    container.style.display = "grid";
    container.innerHTML = uploadedResumeFiles.map((file, idx) => `
        <div class="drop-zone-file-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="drop-zone-file-name" title="${escHtml(file.name)}">${escHtml(file.name)}</span>
            <button class="file-remove-btn" onclick="removeUploadedFile(event, ${idx})" title="Remove file">✕</button>
        </div>
    `).join("");
    
    analyzeBtn.disabled = false;
}

// Global helper for remove file button
window.removeUploadedFile = function (e, index) {
    e.stopPropagation();
    uploadedResumeFiles.splice(index, 1);
    document.getElementById("resumeFileInput").value = ""; // clear picker value to allow re-selection
    renderFilesList();
};

function clearFiles() {
    uploadedResumeFiles = [];
    document.getElementById("resumeFileInput").value = "";
    renderFilesList();
}

// --- Main Batch Analyze Function ---
async function analyzeResume() {
    const jdText = document.getElementById("jdOutput").textContent.trim();

    if (!jdText) {
        const warning = document.getElementById("analyzerWarning");
        warning.style.display = "flex";
        setTimeout(() => { warning.style.display = "none"; }, 4000);
        return;
    }

    if (uploadedResumeFiles.length === 0) {
        alert("Please upload at least one resume file first.");
        return;
    }

    const analyzeBtn   = document.getElementById("analyzeBtn");
    const resultCard   = document.getElementById("analysisResultCard");
    const analysisOut  = document.getElementById("analysisOutput");
    const leaderboard  = document.getElementById("leaderboardList");
    const analysisMeta = document.getElementById("analysisMeta");

    analyzeBtn.disabled = true;
    analyzeBtn.classList.add("loading");

    // Initialize UI states
    leaderboard.innerHTML = '<div class="analysis-streaming">Reranking candidates...</div>';
    analysisOut.innerHTML = '<div class="analysis-streaming">Running batch evaluation against the JD...</div>';
    resultCard.classList.add("visible");

    setTimeout(() => {
        resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);

    const startTime = Date.now();

    try {
        const formData = new FormData();
        formData.append("jd_text", jdText);
        
        // Append multiple files under the same "resume_files" key expected by FastAPIs list[UploadFile]
        uploadedResumeFiles.forEach(file => {
            formData.append("resume_files", file, file.name);
        });

        const response = await fetch("/api/analyze-resume", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
            throw new Error(err.detail || `Server error ${response.status}`);
        }

        const data = await response.json();
        batchAnalysisData = data; // store locally

        // Render rankings list and details
        renderLeaderboard(data);
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (analysisMeta) analysisMeta.textContent = `Completed evaluation of ${uploadedResumeFiles.length} resumes in ${elapsed}s`;

    } catch (error) {
        leaderboard.innerHTML = `<div class="analysis-streaming" style="color:var(--red-err)">Analysis failed.</div>`;
        analysisOut.innerHTML = `<div class="analysis-streaming" style="color:var(--red-err)">[Error] ${error.message}</div>`;
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.classList.remove("loading");
    }
}

function renderLeaderboard(data) {
    const list = document.getElementById("leaderboardList");
    const ranking = data.ranking || [];
    
    if (ranking.length === 0) {
        list.innerHTML = '<div class="analysis-streaming">No candidates ranked.</div>';
        return;
    }
    
    list.innerHTML = ranking.map(item => {
        const name = item.candidate_name;
        const verdictClass = /strong/i.test(item.verdict) ? "strong" :
                             /moderate/i.test(item.verdict) ? "moderate" : "weak";
        const contact = item.contact_info || {};
        const phone = contact.phone || "Not specified";
        const email = contact.email || "Not specified";
        const linkedin = contact.linkedin || "Not specified";
        
        // Clean up linkedIn link if it doesn't have http/https prefix
        let linkedinUrl = linkedin;
        if (linkedinUrl !== "Not specified" && !linkedinUrl.startsWith("http")) {
            linkedinUrl = "https://" + linkedinUrl;
        }

        return `
            <div class="leaderboard-card" data-name="${escHtml(name)}">
                <div class="leaderboard-rank-badge">${item.rank}</div>
                <div class="leaderboard-card-info">
                    <div class="leaderboard-card-name" title="${escHtml(name)}">${escHtml(name)}</div>
                    <div class="leaderboard-card-score-row">
                        <span class="leaderboard-card-score">Score: ${item.score}</span>
                        <span class="leaderboard-card-verdict ${verdictClass}">${escHtml(item.verdict)}</span>
                    </div>
                    <div class="leaderboard-card-justification">${escHtml(item.justification)}</div>
                    
                    <!-- Contact bar - displays on hover -->
                    <div class="leaderboard-card-contact">
                        ${phone !== "Not specified" ? `
                            <span class="contact-item" title="Call ${escHtml(phone)}">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                <span>${escHtml(phone)}</span>
                            </span>
                        ` : ''}
                        ${email !== "Not specified" ? `
                            <span class="contact-item" title="Email ${escHtml(email)}">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                <span>${escHtml(email)}</span>
                            </span>
                        ` : ''}
                        ${linkedin !== "Not specified" ? `
                            <a href="${escHtml(linkedinUrl)}" target="_blank" class="contact-item link-item" title="Visit LinkedIn Profile" onclick="event.stopPropagation()">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                                <span>LinkedIn</span>
                            </a>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join("");
    
    // Wire up active candidate click triggers
    const cards = list.querySelectorAll(".leaderboard-card");
    cards.forEach(card => {
        card.addEventListener("click", () => {
            cards.forEach(c => c.classList.remove("active"));
            card.classList.add("active");
            
            const name = card.dataset.name;
            const report = data.reports[name];
            if (report) {
                document.getElementById("selectedCandidateHeader").textContent = `Assessment: ${name}`;
                document.getElementById("analysisOutput").innerHTML = renderDetailedReport(name, report);
            }
        });
    });
    
    // Automatically select the first ranked candidate to pre-load details
    if (cards.length > 0) {
        cards[0].click();
    }
}

function renderDetailedReport(candidateName, report) {
    const score = report.score || 0;
    const verdict = report.verdict || "Unknown";
    const verdictReason = report.verdict_reason || "";
    const verdictClass = /strong/i.test(verdict) ? "strong" :
                         /moderate/i.test(verdict) ? "moderate" : "weak";

    // Extract new profile fields
    const skillsDomain = report.skills_domain || "Not available";
    const profilePitch = report.profile_pitch || "Not available";
    const profileSummary = report.profile_summary || "Not available";

    // Companies worked at
    const companies = report.companies || [];
    const companiesHtml = companies.length > 0
        ? companies.map(c => `<span class="company-pill">${escHtml(c)}</span>`).join("")
        : '<span class="company-pill company-pill-empty">No companies identified</span>';

    // Strengths list
    const strengthsHtml = (report.strengths || []).map(s => 
        `<div class="report-bullet">
            <span class="report-bullet-dot"></span>
            <span class="report-bullet-text">${escHtml(s)}</span>
        </div>`
    ).join("");

    // Gaps list
    const gapsHtml = (report.gaps || []).map(g => 
        `<div class="report-bullet">
            <span class="report-bullet-dot"></span>
            <span class="report-bullet-text">${escHtml(g)}</span>
        </div>`
    ).join("");

    // Section ratings
    const assessmentHtml = Object.entries(report.assessment || {}).map(([key, val]) => 
        `<div class="assessment-row">
            <span class="assessment-key">${escHtml(key)}</span>
            <span class="assessment-val">${escHtml(val)}</span>
        </div>`
    ).join("");

    // Action Toolbar — View Resume, Copy Skills, Copy Pitch, Copy Summary
    const actionToolbarHtml = `
    <div class="candidate-action-toolbar">
        <button class="candidate-action-btn view-resume-btn" onclick="viewResume('${escHtml(candidateName)}')" title="View full extracted resume text">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>View Resume</span>
        </button>
        <button class="candidate-action-btn" id="copySkillsBtn_${score}" onclick="copyToClipboardWithFeedback(this, \`${report.key_skills && report.key_skills.length ? escHtml(report.key_skills.slice(0, 8).join(', ')).replace(/`/g, '') : escHtml(skillsDomain).split(',').slice(0, 8).join(', ').replace(/`/g, '')}\`)" title="Copy exactly 8 key skills and domain expertise">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Copy Skills</span>
        </button>
        <button class="candidate-action-btn" onclick="copyToClipboardWithFeedback(this, \`${escHtml(profilePitch).replace(/`/g, '')}\`)" title="Copy 2-line client pitch">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <span>Copy Profile Pitch</span>
        </button>
        <button class="candidate-action-btn" onclick="copyToClipboardWithFeedback(this, \`${escHtml(profileSummary).replace(/`/g, '')}\`)" title="Copy 700-character profile summary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
            <span>Copy Profile Summary</span>
        </button>
    </div>`;

    return `
    ${actionToolbarHtml}

    <div class="report-section companies-section">
        <div class="report-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Companies Worked At
        </div>
        <div class="report-section-body companies-body">
            ${companiesHtml}
        </div>
    </div>

    <div class="report-score-banner">
        <div class="report-score-left">
            <span class="report-score-label">Match Score</span>
            <span class="report-score-value">${score} / 100</span>
            <span class="report-score-summary">${escHtml(verdictReason)}</span>
        </div>
        <span class="report-verdict ${verdictClass}">${escHtml(verdict)}</span>
    </div>
    
    <div class="report-section strengths">
        <div class="report-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Strengths
        </div>
        <div class="report-section-body">${strengthsHtml || '<div class="report-bullet-text">No significant strengths highlighted.</div>'}</div>
    </div>
    
    <div class="report-section gaps">
        <div class="report-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Gaps / Areas of Improvement
        </div>
        <div class="report-section-body">${gapsHtml || '<div class="report-bullet-text">No significant gaps identified.</div>'}</div>
    </div>
    
    <div class="report-section assessment">
        <div class="report-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Section Assessment
        </div>
        <div class="report-section-body">${assessmentHtml}</div>
    </div>
    
    <div class="report-section recommendation">
        <div class="report-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Recommendation
        </div>
        <div class="report-section-body">
            <p class="report-recommendation-text">${escHtml(report.recommendation || '')}</p>
        </div>
    </div>`;
}

function escHtml(str) {
    return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// --- Copy Active Analysis Result ---
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


// =============================================
// CANDIDATE PROFILE ACTIONS
// =============================================

// --- View Resume Modal ---
let _currentResumeRawText = ""; // store the raw text for search highlighting

function viewResume(candidateName) {
    if (!batchAnalysisData || !batchAnalysisData.resume_texts) {
        alert("No resume data available.");
        return;
    }

    const resumeText = batchAnalysisData.resume_texts[candidateName];
    if (!resumeText) {
        alert("Resume text not found for this candidate.");
        return;
    }

    _currentResumeRawText = resumeText;
    document.getElementById("resumeModalTitle").textContent = `Resume: ${candidateName}`;
    document.getElementById("resumeModalContent").textContent = resumeText;

    // Clear any previous search
    clearResumeSearch();

    const overlay = document.getElementById("resumeModalOverlay");
    overlay.classList.add("visible");
    document.body.style.overflow = "hidden";

    // Focus the search input after the modal opens
    setTimeout(() => document.getElementById("resumeSearchInput").focus(), 300);
}

function closeResumeModal(event) {
    // If called from overlay click, only close if clicking the backdrop itself
    if (event && event.target !== event.currentTarget) return;

    const overlay = document.getElementById("resumeModalOverlay");
    overlay.classList.remove("visible");
    document.body.style.overflow = "";
    _currentResumeRawText = "";
}

// Close modal on Escape key
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        const overlay = document.getElementById("resumeModalOverlay");
        if (overlay && overlay.classList.contains("visible")) {
            closeResumeModal();
        }
    }
});

// =============================================
// RESUME KEYWORD SEARCH & HIGHLIGHT
// =============================================

let _searchDebounceTimer = null;

// Wire up search input — debounced
document.addEventListener("DOMContentLoaded", function () {
    const searchInput = document.getElementById("resumeSearchInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", function () {
        clearTimeout(_searchDebounceTimer);
        _searchDebounceTimer = setTimeout(() => {
            performResumeSearch(searchInput.value);
        }, 250);
    });
});

function performResumeSearch(query) {
    const contentEl = document.getElementById("resumeModalContent");
    const countEl = document.getElementById("resumeSearchCount");
    const clearBtn = document.getElementById("resumeSearchClear");

    if (!_currentResumeRawText) return;

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
        // No query — show plain text
        contentEl.textContent = _currentResumeRawText;
        countEl.textContent = "";
        clearBtn.style.display = "none";
        return;
    }

    clearBtn.style.display = "flex";

    // Escape regex special chars in the query
    const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escapedQuery})`, "gi");

    // Count matches
    const matches = _currentResumeRawText.match(regex);
    const matchCount = matches ? matches.length : 0;
    countEl.textContent = matchCount > 0 ? `${matchCount} match${matchCount !== 1 ? "es" : ""}` : "No matches";
    countEl.className = "resume-search-count" + (matchCount === 0 ? " no-matches" : "");

    // Build highlighted HTML
    // First escape the raw text for safe HTML, then wrap matches in <mark>
    const safeText = escHtml(_currentResumeRawText);
    const safeEscapedQuery = escHtml(trimmedQuery).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const highlightRegex = new RegExp(`(${safeEscapedQuery})`, "gi");
    contentEl.innerHTML = safeText.replace(highlightRegex, '<mark class="resume-highlight">$1</mark>');

    // Scroll to the first match
    const firstMark = contentEl.querySelector(".resume-highlight");
    if (firstMark) {
        firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function clearResumeSearch() {
    const searchInput = document.getElementById("resumeSearchInput");
    const countEl = document.getElementById("resumeSearchCount");
    const clearBtn = document.getElementById("resumeSearchClear");
    const contentEl = document.getElementById("resumeModalContent");

    if (searchInput) searchInput.value = "";
    if (countEl) countEl.textContent = "";
    if (clearBtn) clearBtn.style.display = "none";
    if (contentEl && _currentResumeRawText) {
        contentEl.textContent = _currentResumeRawText;
    }
}

// --- Copy to Clipboard with Visual Feedback ---
function copyToClipboardWithFeedback(btnElement, text) {
    if (!text || text === "Not available") {
        alert("This information is not available for the selected candidate.");
        return;
    }

    const labelSpan = btnElement.querySelector("span");
    const originalText = labelSpan.textContent;

    const doSuccess = () => {
        btnElement.classList.add("copy-success");
        labelSpan.textContent = "Copied!";
        setTimeout(() => {
            btnElement.classList.remove("copy-success");
            labelSpan.textContent = originalText;
        }, 2000);
    };

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(doSuccess);
    } else {
        // Fallback for HTTP
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        doSuccess();
    }
}


// =============================================
// SOURCING INTELLIGENCE — Mode Switch, Upload, Query
// =============================================

let currentMode = "analyzer"; // 'analyzer' or 'intelligence'

function switchMode(mode) {
    currentMode = mode;

    // Toggle mode sections
    const analyzerSection = document.getElementById("modeAnalyzerSection");
    const intelSection = document.getElementById("modeIntelSection");
    const analyzerBtn = document.getElementById("modeAnalyzerBtn");
    const intelBtn = document.getElementById("modeIntelBtn");
    const title = document.getElementById("topBarTitle");

    if (mode === "analyzer") {
        analyzerSection.classList.add("active");
        intelSection.classList.remove("active");
        analyzerBtn.classList.add("active");
        intelBtn.classList.remove("active");
        title.textContent = "Resume Analyser";
    } else {
        analyzerSection.classList.remove("active");
        intelSection.classList.add("active");
        analyzerBtn.classList.remove("active");
        intelBtn.classList.add("active");
        title.textContent = "Sourcing Intelligence";
        // Load stats when entering intelligence mode
        loadFeedbackStats();
    }
}

// --- Drag & Drop for Feedback Excel ---
document.addEventListener("DOMContentLoaded", function () {
    const zone = document.getElementById("feedbackUploadZone");
    if (!zone) return;

    zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => {
        zone.classList.remove("dragover");
    });
    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("dragover");
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
            _doFeedbackUpload(file);
        } else {
            alert("Please drop a valid .xlsx file.");
        }
    });
});

// --- Upload Feedback Excel ---
function uploadFeedbackExcel() {
    const input = document.getElementById("feedbackFileInput");
    if (!input.files.length) return;
    _doFeedbackUpload(input.files[0]);
}

async function _doFeedbackUpload(file) {
    const resultEl = document.getElementById("feedbackUploadResult");
    resultEl.style.display = "block";
    resultEl.innerHTML = `
        <div class="upload-progress">
            <div class="upload-progress-spinner"></div>
            <span>Processing <strong>${escHtml(file.name)}</strong>... Embedding feedback into vector memory</span>
        </div>
    `;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch("/api/upload-feedback", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) {
            resultEl.innerHTML = `
                <div class="upload-result-error">
                    <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"15\" y1=\"9\" x2=\"9\" y2=\"15\"/><line x1=\"9\" y1=\"9\" x2=\"15\" y2=\"15\"/></svg>
                    <span>${escHtml(data.detail || "Upload failed")}</span>
                </div>
            `;
            return;
        }

        const rolesHtml = data.roles_found.map(r => `<span class="intel-role-tag">${escHtml(r)}</span>`).join("");
        resultEl.innerHTML = `
            <div class="upload-result-success">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <div>
                    <strong>${data.processed}</strong> feedback entries synced to vector memory
                    ${data.skipped > 0 ? `<span class="upload-skipped">(${data.skipped} rows skipped — missing status/feedback)</span>` : ""}
                    <div class="upload-roles-found">${rolesHtml}</div>
                </div>
            </div>
        `;

        // Reload stats
        loadFeedbackStats();

    } catch (err) {
        resultEl.innerHTML = `
            <div class="upload-result-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span>Network error: ${escHtml(err.message)}</span>
            </div>
        `;
    }

    // Reset file input
    document.getElementById("feedbackFileInput").value = "";
}

// --- Load Feedback Stats ---
async function loadFeedbackStats() {
    const panel = document.getElementById("feedbackStatsPanel");
    try {
        const res = await fetch("/api/feedback-stats");
        const data = await res.json();

        if (!data.total || data.total === 0) {
            panel.style.display = "none";
            return;
        }

        const roles = data.roles;
        const roleCards = Object.entries(roles).map(([role, counts]) => `
            <div class="stats-role-card">
                <div class="stats-role-name">${escHtml(role)}</div>
                <div class="stats-role-counts">
                    <span class="stats-count-badge stats-negative">${counts.negative} negative</span>
                    <span class="stats-count-badge stats-positive">${counts.positive} positive</span>
                    <span class="stats-count-badge stats-total">${counts.total} total</span>
                </div>
            </div>
        `).join("");

        panel.style.display = "block";
        panel.innerHTML = `
            <div class="stats-header">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                Vector Memory — ${data.total} entries across ${Object.keys(roles).length} roles
            </div>
            <div class="stats-roles-grid">${roleCards}</div>
        `;
    } catch (err) {
        panel.style.display = "none";
    }
}

// --- Query Rejection Trends ---
async function queryRejectionTrends() {
    const roleInput = document.getElementById("intelRoleInput");
    const role = roleInput.value.trim();
    if (!role) {
        alert("Please enter a role name to analyze.");
        roleInput.focus();
        return;
    }

    const resultCard = document.getElementById("trendsResultCard");
    const resultBody = document.getElementById("trendsResultBody");
    const analyzeBtn = document.getElementById("intelAnalyzeBtn");

    // Show loading
    resultCard.style.display = "block";
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = `<div class="upload-progress-spinner" style="width:14px;height:14px"></div> Analyzing...`;
    resultBody.innerHTML = `
        <div class="intel-loading">
            <div class="upload-progress-spinner"></div>
            <span>Searching vector memory for <strong>${escHtml(role)}</strong> rejection patterns...</span>
        </div>
    `;

    try {
        const res = await fetch("/api/rejection-trends", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
        });
        const data = await res.json();

        if (!res.ok) {
            resultBody.innerHTML = `<div class="upload-result-error"><span>${escHtml(data.detail || "Error")}</span></div>`;
            return;
        }

        if (data.candidate_count === 0 || data.confidence === "None") {
            resultBody.innerHTML = `
                <div class="intel-no-results">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>No rejection feedback found for <strong>"${escHtml(role)}"</strong>. Upload feedback data first, or check the exact role name.</span>
                </div>
            `;
            return;
        }

        document.getElementById("trendsResultTitle").textContent = `Rejection Trends: ${role}`;
        document.getElementById("trendsResultSubtitle").textContent = `Averaged insights from ${data.candidate_count} rejected candidate${data.candidate_count !== 1 ? "s" : ""}`;

        renderTrendsResults(data, role);

    } catch (err) {
        resultBody.innerHTML = `<div class="upload-result-error"><span>Network error: ${escHtml(err.message)}</span></div>`;
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Analyze Trends`;
    }
}

function renderTrendsResults(data, role) {
    const resultBody = document.getElementById("trendsResultBody");

    // Confidence badge
    const confClass = data.confidence === "High" ? "conf-high" : data.confidence === "Medium" ? "conf-medium" : "conf-low";

    // Common gaps
    const gapsHtml = (data.common_gaps || []).map(g => `
        <div class="intel-gap-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            <span>${escHtml(g)}</span>
        </div>
    `).join("");

    // Individual feedback entries
    const entriesHtml = (data.feedback_entries || []).map((e, i) => `
        <div class="intel-feedback-entry">
            <div class="intel-feedback-entry-header">
                <span class="intel-feedback-candidate">${escHtml(e.candidate_name || "Unknown")}</span>
                <span class="intel-feedback-status">${escHtml(e.status_raw || "")}</span>
            </div>
            <div class="intel-feedback-text">${escHtml(e.feedback_text || "")}</div>
        </div>
    `).join("");

    resultBody.innerHTML = `
        <!-- Stats Bar -->
        <div class="intel-stats-bar">
            <span class="intel-stat-chip">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                ${data.candidate_count} candidates analyzed
            </span>
            <span class="intel-stat-chip intel-conf-chip ${confClass}">
                Confidence: ${data.confidence}
            </span>
        </div>

        <!-- Sourcing Refinement (the key output) -->
        <div class="intel-refinement-section">
            <div class="intel-refinement-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>Sourcing Refinement — Add this to your demand</span>
                <button class="intel-copy-btn" onclick="copyRefinementText()" title="Copy refinement text">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copy</span>
                </button>
            </div>
            <div class="intel-refinement-body" id="refinementText">${escHtml(data.sourcing_refinement || "")}</div>
        </div>

        <!-- Common Gaps -->
        <div class="intel-section">
            <div class="intel-section-header">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Common Gaps Across Rejected Candidates
            </div>
            <div class="intel-section-body">${gapsHtml || '<span class="intel-muted">No specific gaps identified.</span>'}</div>
        </div>

        <!-- Individual Feedback Entries -->
        <div class="intel-section intel-entries-section">
            <div class="intel-section-header">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Individual Client Feedback (${data.feedback_entries ? data.feedback_entries.length : 0} entries)
            </div>
            <div class="intel-section-body intel-entries-body">${entriesHtml}</div>
        </div>
    `;
}

// --- Copy Refinement Text ---
function copyRefinementText() {
    const text = document.getElementById("refinementText").textContent;
    if (!text.trim()) return;

    const btn = document.querySelector(".intel-copy-btn");
    const labelSpan = btn.querySelector("span");

    const doSuccess = () => {
        btn.classList.add("copy-success");
        labelSpan.textContent = "Copied!";
        setTimeout(() => { btn.classList.remove("copy-success"); labelSpan.textContent = "Copy"; }, 2000);
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

// --- Clear Vector Memory ---
async function clearVectorMemory() {
    if (!confirm("Are you sure you want to clear all candidate feedback from vector memory? This action cannot be undone.")) {
        return;
    }

    try {
        const res = await fetch("/api/clear-feedback", { method: "POST" });
        const data = await res.json();

        if (res.ok) {
            alert(data.message || "Vector memory cleared successfully.");
            
            // Clear stats display
            const statsPanel = document.getElementById("feedbackStatsPanel");
            if (statsPanel) {
                statsPanel.style.display = "none";
                statsPanel.innerHTML = "";
            }
            
            // Clear search result card
            const resultCard = document.getElementById("trendsResultCard");
            if (resultCard) {
                resultCard.style.display = "none";
            }
            
            // Clear upload results message
            const uploadResult = document.getElementById("feedbackUploadResult");
            if (uploadResult) {
                uploadResult.style.display = "none";
                uploadResult.innerHTML = "";
            }
        } else {
            alert("Error clearing vector memory: " + (data.detail || "Server error"));
        }
    } catch (err) {
        alert("Failed to connect to server: " + err.message);
    }
}
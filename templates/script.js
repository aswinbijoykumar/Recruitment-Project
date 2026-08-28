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
    const tokenDisplay = document.getElementById("tokenCount");
    const timeDisplay  = document.getElementById("timeCount");
    if (tokenDisplay) tokenDisplay.textContent = "—";
    if (timeDisplay) timeDisplay.textContent  = "—";

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
    if (dot) {
        dot.className = "status-dot";
        if (state === "processing") dot.classList.add("processing");
        if (state === "error")      dot.classList.add("error");
    }
    if (label) {
        label.textContent = text;
    }
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

async function loadSavedDatasets() {
    try {
        const res = await fetch("/api/feedback-datasets");
        const list = await res.json();
        renderSavedDatasets(list);
    } catch (_) {
        // silently fail
    }
}

function renderSavedDatasets(list) {
    const container = document.getElementById("savedFeedbackList");
    const emptyEl   = document.getElementById("savedFeedbackEmpty");
    if (!container) return;

    Array.from(container.querySelectorAll(".saved-feedback-card")).forEach(el => el.remove());

    if (!list || list.length === 0) {
        if (emptyEl) emptyEl.style.display = "flex";
        return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    list.forEach(ds => {
        const card = document.createElement("div");
        card.className = "saved-jd-card saved-feedback-card";
        card.dataset.id = ds.id;

        const dateStr = ds.created_at ? new Date(ds.created_at.endsWith("Z") ? ds.created_at : ds.created_at + "Z").toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "";

        const roleTags = (ds.roles || []).slice(0, 3).map(
            r => `<span class="saved-jd-kw" style="background:rgba(52, 211, 153, 0.12); color:#34d399; font-size:10px;">${escHtml(r)}</span>`
        ).join("");

        card.innerHTML = `
            <div class="saved-jd-card-title" title="${escHtml(ds.filename)}">📊 ${escHtml(ds.filename)}</div>
            <div class="saved-jd-card-date">${ds.row_count} records · ${dateStr}</div>
            ${roleTags ? `<div class="saved-jd-keywords" style="margin-top:4px;">${roleTags}</div>` : ""}
            <button class="saved-jd-delete feedback-dataset-delete" data-id="${ds.id}" title="Delete sheet">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>`;

        card.addEventListener("click", (e) => {
            if (e.target.closest(".feedback-dataset-delete")) return;
            viewDatasetDetails(ds.id);
        });

        const delBtn = card.querySelector(".feedback-dataset-delete");
        if (delBtn) {
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                deleteDataset(ds.id);
            });
        }

        container.appendChild(card);
    });
}

async function deleteDataset(id) {
    if (!confirm("Are you sure you want to delete this saved feedback sheet?")) return;
    try {
        const res = await fetch(`/api/feedback-datasets/${id}`, { method: "DELETE" });
        if (res.ok) {
            await loadSavedDatasets();
            await loadFeedbackStats();
        } else {
            alert("Failed to delete feedback dataset.");
        }
    } catch (err) {
        alert("Error deleting dataset: " + err.message);
    }
}

async function viewDatasetDetails(id) {
    if (typeof switchMode === 'function') switchMode('intelligence');
    try {
        const res = await fetch(`/api/feedback-datasets/${id}`);
        const ds = await res.json();
        if (ds && ds.roles && ds.roles.length > 0) {
            const roleInput = document.getElementById("intelRoleInput");
            if (roleInput) {
                roleInput.value = ds.roles[0];
                queryRejectionTrends();
            }
        }
    } catch (_) {}
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

// --- Export .pdf ---
function exportPDF() {
    try {
        const jdElement = document.getElementById("jdOutput");
        if (!jdElement) {
            alert("JD Output element not found.");
            return;
        }
        
        const text = jdElement.innerText || jdElement.textContent;
        if (!text.trim()) {
            alert("No JD text to export.");
            return;
        }

        // If jsPDF is not loaded yet, try to load it dynamically
        if (typeof window.jspdf === 'undefined') {
            console.log("jsPDF not loaded. Attempting dynamic load...");
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => {
                console.log("jsPDF loaded successfully via dynamic fallback.");
                exportPDF();
            };
            script.onerror = () => {
                alert("Failed to load PDF generation library (jsPDF). Please check your internet connection.");
            };
            document.head.appendChild(script);
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        const maxLineWidth = pageWidth - (margin * 2);
        
        // Split the entire text into lines that wrap nicely
        const lines = doc.splitTextToSize(text, maxLineWidth);
        
        let cursorY = margin;
        const lineHeight = 6.5; // spacing in mm

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(33, 37, 41); // professional dark slate color

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Simple page breaking
            if (cursorY + lineHeight > pageHeight - margin) {
                doc.addPage();
                cursorY = margin;
            }

            // Detect if line is a header to bold it slightly
            const cleanLine = line.trim().replace(/^[-*•\s]+/, '');
            const isHeader = /^(Job Title|Role Overview|Key Responsibilities|Required Skills & Qualifications|Required Skills and Qualifications|Preferred Experience):?$/i.test(cleanLine);
            if (isHeader) {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.setTextColor(13, 27, 46); // Brand dark navy color
                cursorY += 2; // Extra spacing before header
            } else {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(33, 37, 41);
            }

            doc.text(line, margin, cursorY);
            cursorY += lineHeight;
        }

        doc.save("Protiviti_JD_" + Date.now() + ".pdf");
    } catch (e) {
        console.error("PDF generation failed:", e);
        alert("Failed to export PDF: " + e.message);
    }
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
    if (tokenDisplay) tokenDisplay.textContent = "0";
    if (timeDisplay) timeDisplay.textContent  = "0.0s";

    // Smooth scroll to output
    setTimeout(() => {
        outputContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);

    // Timer
    const startTime = Date.now();
    let timerInterval = setInterval(() => {
        if (timeDisplay) timeDisplay.textContent = ((Date.now() - startTime) / 1000).toFixed(1) + "s";
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
            if (tokenDisplay) tokenDisplay.textContent = Math.round(totalBytes / 4);
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

let currentMode = "analyzer"; // 'analyzer', 'intelligence', 'questions', or 'client_ppt'
let currentClientProfileData = null;

function switchMode(mode) {
    currentMode = mode;

    // Main workspace mode sections
    const analyzerSection = document.getElementById("modeAnalyzerSection");
    const intelSection = document.getElementById("modeIntelSection");
    const questionsSection = document.getElementById("modeQuestionsSection");
    const clientPptSection = document.getElementById("modeClientPptSection");
    
    // Top bar toggle buttons
    const analyzerBtn = document.getElementById("modeAnalyzerBtn");
    const intelBtn = document.getElementById("modeIntelBtn");
    const questionsBtn = document.getElementById("modeQuestionBankBtn");
    const clientPptBtn = document.getElementById("modeClientPptBtn");
    
    // Sidebar mode sections
    const sbAnalyzer = document.getElementById("sidebarSectionAnalyzer");
    const sbIntel = document.getElementById("sidebarSectionIntelligence");
    const sbQuestions = document.getElementById("sidebarSectionQuestions");
    const sbClientPpt = document.getElementById("sidebarSectionClientPpt");

    const title = document.getElementById("topBarTitle");

    // Reset workspace visibility
    if (analyzerSection) analyzerSection.classList.remove("active");
    if (intelSection) intelSection.classList.remove("active");
    if (questionsSection) questionsSection.classList.remove("active");
    if (clientPptSection) clientPptSection.classList.remove("active");

    if (analyzerBtn) analyzerBtn.classList.remove("active");
    if (intelBtn) intelBtn.classList.remove("active");
    if (questionsBtn) questionsBtn.classList.remove("active");
    if (clientPptBtn) clientPptBtn.classList.remove("active");

    // Reset sidebar visibility
    if (sbAnalyzer) sbAnalyzer.classList.remove("active");
    if (sbIntel) sbIntel.classList.remove("active");
    if (sbQuestions) sbQuestions.classList.remove("active");
    if (sbClientPpt) sbClientPpt.classList.remove("active");

    if (mode === "analyzer") {
        if (analyzerSection) analyzerSection.classList.add("active");
        if (analyzerBtn) analyzerBtn.classList.add("active");
        if (sbAnalyzer) sbAnalyzer.classList.add("active");
        if (title) title.textContent = "Resume Analyser";
        loadSavedJDs();
    } else if (mode === "intelligence") {
        if (intelSection) intelSection.classList.add("active");
        if (intelBtn) intelBtn.classList.add("active");
        if (sbIntel) sbIntel.classList.add("active");
        if (title) title.textContent = "Sourcing Intelligence";
        loadSavedDatasets();
        loadFeedbackStats();
    } else if (mode === "questions") {
        if (questionsSection) questionsSection.classList.add("active");
        if (questionsBtn) questionsBtn.classList.add("active");
        if (sbQuestions) sbQuestions.classList.add("active");
        if (title) title.textContent = "Interview Question Bank";
        loadQuestionBankRoles();
    } else if (mode === "client_ppt") {
        if (clientPptSection) clientPptSection.classList.add("active");
        if (clientPptBtn) clientPptBtn.classList.add("active");
        if (sbClientPpt) sbClientPpt.classList.add("active");
        if (title) title.textContent = "Client PPT Profile Generator";
        loadSavedClientPptHistory();
    }
}

function onClientCvFileSelected(input) {
    const label = document.getElementById("clientCvFileName");
    if (input.files && input.files[0]) {
        label.innerHTML = `Selected: <strong>${escHtml(input.files[0].name)}</strong>`;
    } else {
        label.textContent = "Choose or drag candidate CV file";
    }
}

function onClientJdFileSelected(input) {
    const label = document.getElementById("clientJdFileName");
    if (input.files && input.files[0]) {
        label.innerHTML = `Selected JD: <strong>${escHtml(input.files[0].name)}</strong>`;
    } else {
        label.textContent = "Upload JD File (PDF, DOCX, TXT)";
    }
}

function resetClientPptForm() {
    const fileInput = document.getElementById("clientCvFileInput");
    const fileLabel = document.getElementById("clientCvFileName");
    const jdFileInput = document.getElementById("clientJdFileInput");
    const jdFileLabel = document.getElementById("clientJdFileName");
    const jdInput = document.getElementById("clientJdInput");
    const resultCard = document.getElementById("clientPptResultCard");

    if (fileInput) fileInput.value = "";
    if (fileLabel) fileLabel.textContent = "Choose or drag candidate CV file";
    if (jdFileInput) jdFileInput.value = "";
    if (jdFileLabel) jdFileLabel.textContent = "Upload JD File (PDF, DOCX, TXT)";
    if (jdInput) jdInput.value = "";
    if (resultCard) resultCard.style.display = "none";
    currentClientProfileData = null;
}

// Local Storage for Client Profile Decks
function saveClientPptToHistory(data) {
    try {
        let history = JSON.parse(localStorage.getItem("client_ppt_history") || "[]");
        const rawName = data.candidate_name || "Candidate Profile";
        
        // Count existing occurrences of candidate_name to append suffix like (1), (2)
        const matchCount = history.filter(i => {
            const baseName = (i.candidate_name || "").replace(/\s\(\d+\)$/, "");
            return baseName.toLowerCase() === rawName.toLowerCase();
        }).length;

        const displayName = matchCount > 0 ? `${rawName} (${matchCount})` : rawName;

        const newItem = {
            id: Date.now(),
            candidate_name: displayName,
            grade_band: data.grade_band || "",
            timestamp: new Date().toLocaleDateString(),
            payload: data
        };
        history.unshift(newItem);
        if (history.length > 25) history = history.slice(0, 25);
        localStorage.setItem("client_ppt_history", JSON.stringify(history));
        loadSavedClientPptHistory();
    } catch (e) {
        console.error("Failed to save client PPT history", e);
    }
}

function loadSavedClientPptHistory() {
    const listContainer = document.getElementById("savedClientPptList");
    if (!listContainer) return;
    try {
        const history = JSON.parse(localStorage.getItem("client_ppt_history") || "[]");
        if (history.length === 0) {
            listContainer.innerHTML = `
                <div class="saved-jd-empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                    <span>Generate your first profile to save decks.</span>
                </div>`;
            return;
        }

        listContainer.innerHTML = history.map(item => `
            <div class="saved-jd-card" style="display:flex; align-items:center; justify-space-between; padding:8px 10px; gap:8px;">
                <div style="flex:1; cursor:pointer; overflow:hidden;" onclick="redownloadSavedClientPpt(${item.id})">
                    <div class="saved-jd-card-title" style="font-size:12px; font-weight:700; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(item.candidate_name)}</div>
                    <div style="font-size:10px; color:var(--text-muted);">${escHtml(item.grade_band || "Client Profile")} · ${item.timestamp}</div>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                    <button onclick="redownloadSavedClientPpt(${item.id})" title="Re-download PPTX" style="background:none; border:none; color:#0096c8; cursor:pointer; padding:3px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                    <button onclick="deleteClientPptHistory(${item.id}, event)" title="Delete saved profile" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:3px;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text-muted)'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
        `).join("");
    } catch (e) {
        console.error("Failed to load saved client PPT history", e);
    }
}

function deleteClientPptHistory(id, event) {
    if (event) event.stopPropagation();
    try {
        let history = JSON.parse(localStorage.getItem("client_ppt_history") || "[]");
        history = history.filter(i => i.id !== id);
        localStorage.setItem("client_ppt_history", JSON.stringify(history));
        loadSavedClientPptHistory();
    } catch (e) {
        console.error("Failed to delete client PPT history item", e);
    }
}

async function redownloadSavedClientPpt(id) {
    try {
        const history = JSON.parse(localStorage.getItem("client_ppt_history") || "[]");
        const item = history.find(i => i.id === id);
        if (!item) return;

        const pptxRes = await fetch("/api/client-profile/download-pptx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
        });

        if (!pptxRes.ok) {
            alert("Failed to prepare presentation download.");
            return;
        }

        const blob = await pptxRes.blob();
        const candName = item.candidate_name || "Candidate Profile";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${candName} CV.pptx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("Failed to re-download: " + e.message);
    }
}

async function generateClientProfile() {
    const cvFileInput = document.getElementById("clientCvFileInput");
    const jdFileInput = document.getElementById("clientJdFileInput");
    const jdInput = document.getElementById("clientJdInput");
    const btn = document.getElementById("generateClientPptBtn");
    const resultCard = document.getElementById("clientPptResultCard");

    if (!cvFileInput.files || cvFileInput.files.length === 0) {
        alert("Please select a candidate CV file (PDF, DOCX, or TXT).");
        return;
    }

    const hasJdFile = jdFileInput && jdFileInput.files && jdFileInput.files.length > 0;
    const jdText = jdInput ? jdInput.value.trim() : "";

    if (!hasJdFile && !jdText) {
        alert("Please provide the target Job Description (JD) by uploading a file (PDF, DOCX) or entering text.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<div class="upload-progress-spinner" style="width:16px;height:16px;"></div> Generating Client Submission Profile...`;

    const formData = new FormData();
    formData.append("file", cvFileInput.files[0]);
    if (hasJdFile) {
        formData.append("jd_file", jdFileInput.files[0]);
    }
    if (jdText) {
        formData.append("jd_text", jdText);
    }

    try {
        const res = await fetch("/api/client-profile/generate", {
            method: "POST",
            body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
            alert("Error: " + (data.detail || "Failed to generate profile."));
            return;
        }

        currentClientProfileData = data;
        
        // Trigger Direct Download of PPTX Presentation Deck
        const pptxRes = await fetch("/api/client-profile/download-pptx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        if (!pptxRes.ok) {
            alert("Failed to prepare presentation download.");
            return;
        }

        const blob = await pptxRes.blob();
        const candName = data.candidate_name || "Candidate Profile";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${candName} CV.pptx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        saveClientPptToHistory(data);

    } catch (err) {
        alert("Network error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Generate Client Profile (PPT Format)`;
    }
}

function renderClientProfilePreview(data) {
    const candNameEl = document.getElementById("clientPptCandName");
    const candExpEl = document.getElementById("clientPptCandExp");
    const resultBody = document.getElementById("clientPptResultBody");

    const candName = data.candidate_name || "Candidate Profile";
    const gradeBand = data.grade_band || "GCB 4";

    if (candNameEl) candNameEl.textContent = candName;
    if (candExpEl) candExpEl.textContent = `Grade / Band: ${gradeBand} · Client Submission Ready`;

    const summaryHtml = escHtml(data.professional_summary || "");

    const kwListHtml = (data.areas_of_expertise || []).slice(0, 20).map(kw => `
        <li style="margin-bottom:3px; color:#1e293b;">${escHtml(kw)}</li>
    `).join("");

    const indListHtml = (data.industry_expertise || []).slice(0, 4).map(ind => `
        <li style="margin-bottom:3px; color:#1e293b;">${escHtml(ind)}</li>
    `).join("");

    const edListHtml = ((data.education && data.education.length > 0) ? data.education : ["Bachelor of Engineering / Related Field"]).map(ed => `
        <li style="margin-bottom:3px; color:#1e293b;">${escHtml(ed)}</li>
    `).join("");

    const projHtml = (data.major_projects || []).slice(0, 4).map(p => `
        <div style="margin-bottom:12px;">
            <div style="font-size:12.5px; font-weight:800; color:#0b3b60; margin-bottom:4px;">
                ${escHtml(p.industry_desc || "Organization")} – ${escHtml(p.project_theme || "Project")} – ${escHtml(p.role || "Consultant")}
            </div>
            <ul style="margin:0; padding-left:18px; color:#1e293b; font-size:11.5px; line-height:1.5;">
                ${(p.bullets || []).slice(0, 4).map(b => `<li>${escHtml(b)}</li>`).join("")}
            </ul>
        </div>
    `).join("");

    resultBody.innerHTML = `
        <div style="background:#ffffff; border-radius:6px; overflow:hidden; box-shadow:0 8px 24px rgba(0,0,0,0.3); color:#1e293b; font-family:Arial, sans-serif; display:flex; min-height:540px; position:relative;">
            
            <!-- LEFT BLUE SIDEBAR -->
            <div style="width:240px; background:#0b3b60; color:#ffffff; padding:40px 24px; display:flex; flex-direction:column; justify-content:center; flex-shrink:0;">
                <div style="font-size:26px; font-weight:800; line-height:1.2; letter-spacing:0.5px; text-transform:capitalize;">
                    ${escHtml(candName).replace(/\s+/g, '<br>')}
                </div>
                <div style="font-size:18px; font-weight:700; color:#ffffff; margin-top:24px;">
                    ${escHtml(gradeBand)}
                </div>
            </div>

            <!-- MAIN CONTENT CONTAINER -->
            <div style="flex:1; padding:24px 28px; display:grid; grid-template-columns: 220px 1fr; gap:24px; background:#ffffff; position:relative;">
                
                <!-- COLUMN 1: EXPERTISE & EDUCATION -->
                <div style="font-size:11px;">
                    <!-- AREAS OF EXPERTISE -->
                    <div style="font-size:11px; font-weight:800; color:#0096c8; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:6px;">
                        AREAS OF EXPERTISE
                    </div>
                    <ul style="margin:0 0 16px 0; padding-left:14px; list-style-type:disc; line-height:1.4;">
                        ${kwListHtml}
                    </ul>

                    <!-- INDUSTRY EXPERTISE -->
                    <div style="font-size:11px; font-weight:800; color:#0096c8; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:6px;">
                        INDUSTRY EXPERTISE
                    </div>
                    <ul style="margin:0 0 16px 0; padding-left:14px; list-style-type:disc; line-height:1.4;">
                        ${indListHtml}
                    </ul>

                    <!-- EDUCATION -->
                    <div style="font-size:11px; font-weight:800; color:#0096c8; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:6px;">
                        EDUCATION
                    </div>
                    <ul style="margin:0; padding-left:14px; list-style-type:disc; line-height:1.4;">
                        ${edListHtml}
                    </ul>
                </div>

                <!-- COLUMN 2: SUMMARY & PROJECTS -->
                <div style="font-size:11.5px; padding-right:10px;">
                    <!-- PROFESSIONAL EXPERIENCE -->
                    <div style="font-size:11px; font-weight:800; color:#0096c8; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:6px;">
                        PROFESSIONAL EXPERIENCE
                    </div>
                    <div style="color:#1e293b; line-height:1.55; margin-bottom:16px;">
                        ${summaryHtml}
                    </div>

                    <!-- MAJOR PROJECTS -->
                    <div style="font-size:11px; font-weight:800; color:#0096c8; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:8px;">
                        MAJOR PROJECTS
                    </div>
                    <div>
                        ${projHtml}
                    </div>

                    <!-- PROTIVITI LOGO BRANDING -->
                    <div style="position:absolute; bottom:16px; right:24px; font-size:20px; font-weight:800; color:#0b3b60; font-family:Arial, sans-serif;">
                        protiviti<span style="font-size:10px; vertical-align:super;">®</span>
                    </div>
                </div>

            </div>

        </div>
    `;
}

async function downloadClientPptx() {
    if (!currentClientProfileData) {
        alert("No generated profile available to download.");
        return;
    }

    try {
        const res = await fetch("/api/client-profile/download-pptx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(currentClientProfileData),
        });

        if (!res.ok) {
            let errDetail = "Download failed";
            try {
                const errData = await res.json();
                errDetail = errData.detail || errDetail;
            } catch (_) {}
            alert("Error generating PowerPoint deck: " + errDetail);
            return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const candName = currentClientProfileData.candidate_name || "Candidate Profile";
        a.download = `${candName} CV.pptx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (err) {
        alert("Error downloading PowerPoint deck: " + err.message);
    }
}

function uploadFeedbackExcelFromSidebar(inputEl) {
    if (!inputEl || !inputEl.files || inputEl.files.length === 0) return;
    _doFeedbackUpload(inputEl.files[0]);
    inputEl.value = "";
}


// =============================================
// INTERVIEW QUESTION BANK — Controller & CRUD
// =============================================

let activeQuestionsRole = null;
let currentQuestionsTab = "pack";
let refinedQuestionsPreviewList = [];

let allQuestionBankRoles = [];

// Filter sidebar roles in real-time
function filterSidebarRoles(query) {
    const listContainer = document.getElementById("sidebarRolesListGroup") || document.getElementById("rolesListGroup");
    if (!listContainer) return;
    
    const q = (query || "").trim().toLowerCase();
    const filtered = allQuestionBankRoles.filter(role => role.toLowerCase().includes(q));

    if (filtered.length === 0) {
        listContainer.innerHTML = '<div class="saved-jd-empty">No matching roles found</div>';
        return;
    }

    listContainer.innerHTML = filtered.map(role => `
        <div class="saved-jd-card role-list-item ${activeQuestionsRole === role ? 'active' : ''}" onclick="selectQuestionBankRole('${escHtml(role).replace(/'/g, "\\'")}')" style="display:flex; align-items:center; justify-content:space-between;">
            <div class="saved-jd-card-title">${escHtml(role)}</div>
            <span style="font-size:10px; font-weight:700; background:rgba(0,150,200,0.15); color:#0096c8; padding:2px 6px; border-radius:10px;">Bank</span>
        </div>
    `).join("");
}

// Load unique roles with banks
async function loadQuestionBankRoles() {
    try {
        const res = await fetch("/api/question-bank/roles");
        const data = await res.json();
        
        const listContainer = document.getElementById("sidebarRolesListGroup") || document.getElementById("rolesListGroup");
        if (!listContainer) return;
        
        allQuestionBankRoles = data.roles || [];
        const searchInput = document.getElementById("roleSearchInput");
        const filterVal = searchInput ? searchInput.value : "";
        filterSidebarRoles(filterVal);

        // Auto-select first role if none is active
        if (!activeQuestionsRole && allQuestionBankRoles.length > 0) {
            selectQuestionBankRole(allQuestionBankRoles[0]);
        }
    } catch (err) {
        console.error("Failed to load roles", err);
    }
}

// Select a role
async function selectQuestionBankRole(role) {
    activeQuestionsRole = role;
    
    // Highlight list item in sidebar
    const items = document.querySelectorAll(".role-list-item");
    items.forEach(item => item.classList.remove("active"));
    const activeItem = Array.from(items).find(el => {
        const titleEl = el.querySelector(".saved-jd-card-title") || el.querySelector(".role-list-item-name");
        return titleEl && titleEl.textContent.trim() === role;
    });
    if (activeItem) activeItem.classList.add("active");
    
    // Setup workspace view
    const workspaceCard = document.getElementById("questionsWorkspaceCard");
    const roleHeader = document.getElementById("activeRoleNameHeader");

    if (workspaceCard) workspaceCard.style.display = "block";
    if (roleHeader) roleHeader.textContent = role;
    
    // Reset ingest form and previews
    document.getElementById("rawNotesInput").value = "";
    document.getElementById("feedbackPreviewArea").style.display = "none";
    document.getElementById("previewQuestionsList").innerHTML = "";
    refinedQuestionsPreviewList = [];
    
    // Switch to current active tab
    switchQuestionsTab(currentQuestionsTab);
}

// Create new role bank
async function createNewRoleBank() {
    const input = document.getElementById("newRoleInput");
    const role = input.value.trim();
    if (!role) {
        alert("Please enter a valid job role name.");
        input.focus();
        return;
    }
    
    input.value = "";
    await selectQuestionBankRole(role);
    
    // Add to list visually (or reload)
    await loadQuestionBankRoles();
    // Re-select to highlight
    await selectQuestionBankRole(role);
}

// Switch Questions tab
function switchQuestionsTab(tab) {
    currentQuestionsTab = tab;
    
    const tabs = ["pack", "ingest", "generic"];
    tabs.forEach(t => {
        const btn = document.getElementById(`questionsTabBtn_${t}`);
        const content = document.getElementById(`questionsTabContent_${t}`);
        if (btn) {
            if (t === tab) btn.classList.add("active");
            else btn.classList.remove("active");
        }
        if (content) {
            if (t === tab) content.classList.add("active");
            else content.classList.remove("active");
        }
    });
    
    if (tab === "pack") {
        loadQuestionPack();
    } else if (tab === "generic") {
        loadGenericQuestions();
    }
}

// ── SUBTAB 1: QUESTION PACK ──────────────────────────────────────────────────

let activePackQuestions = [];

async function loadQuestionPack() {
    if (!activeQuestionsRole) return;
    
    const listContainer = document.getElementById("packQuestionsList");
    listContainer.innerHTML = '<div class="analysis-streaming">Generating question pack...</div>';
    
    try {
        const res = await fetch(`/api/question-bank/pack?role_id=${encodeURIComponent(activeQuestionsRole)}`);
        const data = await res.json();
        
        document.getElementById("packClientCount").textContent = `${data.client_count || 0} Client/Dynamic`;
        document.getElementById("packGenericCount").textContent = `${data.questions.filter(q => q.type === "generic").length || 0} Generic Backfills`;
        
        const questions = data.questions || [];
        activePackQuestions = questions;
        
        if (questions.length === 0) {
            listContainer.innerHTML = '<div class="roles-list-empty">No questions generated. Ingest some feedback notes or add generic questions first!</div>';
            return;
        }
        
        listContainer.innerHTML = questions.map((q, idx) => {
            const badgeType = q.type === "client" ? "client-badge" : "generic-badge";
            const badgeLabel = q.type === "client" ? `Client (Asked ${q.frequency}x)` : "Generic Static";
            return `
                <div class="pack-question-item">
                    <div class="pack-question-num">${idx + 1}</div>
                    <div style="flex:1">
                        <div class="pack-question-text">${escHtml(q.text)}</div>
                        <span class="pack-question-badge ${badgeType}">${badgeLabel}</span>
                    </div>
                </div>
            `;
        }).join("");
    } catch (err) {
        listContainer.innerHTML = `<div class="roles-list-empty" style="color:var(--red-err)">Failed to load question pack.</div>`;
    }
}

function copyQuestionPack() {
    if (activePackQuestions.length === 0) return;
    
    const text = activePackQuestions.map((q, idx) => `${idx + 1}. ${q.text}`).join("\n");
    const btn = document.getElementById("copyPackBtnLabel");
    
    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy Question Pack"; }, 2000);
    });
}

// ── SUBTAB 2: INGEST FEEDBACK ────────────────────────────────────────────────

async function processRawFeedback() {
    if (!activeQuestionsRole) return;
    
    const notesInput = document.getElementById("rawNotesInput");
    const rawNotes = notesInput.value.trim();
    if (!rawNotes) {
        alert("Please paste some post-interview candidate notes first.");
        notesInput.focus();
        return;
    }
    
    const refineBtn = document.getElementById("refineFeedbackBtn");
    const previewArea = document.getElementById("feedbackPreviewArea");
    const previewList = document.getElementById("previewQuestionsList");
    
    refineBtn.disabled = true;
    refineBtn.innerHTML = '<div class="upload-progress-spinner" style="width:14px;height:14px"></div> Processing notes...';
    previewArea.style.display = "none";
    previewList.innerHTML = "";
    
    try {
        const res = await fetch("/api/question-bank/refine-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role_id: activeQuestionsRole, raw_notes: rawNotes })
        });
        const data = await res.json();
        
        if (!res.ok) {
            alert("Error processing feedback: " + (data.detail || "Server error"));
            return;
        }
        
        refinedQuestionsPreviewList = data.refined || [];
        if (refinedQuestionsPreviewList.length === 0) {
            previewList.innerHTML = '<div class="roles-list-empty">AI did not extract any questions. Make sure the notes contain query descriptions.</div>';
            previewArea.style.display = "block";
            return;
        }
        
        previewList.innerHTML = refinedQuestionsPreviewList.map((q, idx) => {
            const isMatch = q.matched_id !== null;
            const matchHtml = isMatch 
                ? `<span class="preview-match-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Matched Existing Question
                   </span>` 
                : `<span class="preview-new-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    New Synthesized Question
                   </span>`;
                
            return `
                <div class="preview-question-card" id="previewCard_${idx}">
                    <div class="preview-card-header">
                        <label class="preview-check-label">
                            <input type="checkbox" id="checkRefined_${idx}" checked onchange="togglePreviewCardState(${idx})" class="preview-checkbox" />
                            <span>Include in Sync</span>
                        </label>
                        <div class="preview-badge-wrapper">${matchHtml}</div>
                    </div>
                    <div class="preview-card-body">
                        <div class="preview-raw-box">
                            <span class="preview-raw-label">Raw Candidate Note</span>
                            <span class="preview-raw-text">"${escHtml(q.raw_text)}"</span>
                        </div>
                        <div class="preview-edit-field-group">
                            <label class="preview-field-label" for="cleanInput_${idx}">Refined Question (Editable):</label>
                            <textarea id="cleanInput_${idx}" class="form-textarea preview-clean-input" rows="2">${escHtml(q.clean_text)}</textarea>
                        </div>
                    </div>
                </div>
            `;
        }).join("");
        
        previewArea.style.display = "block";
    } catch (err) {
        alert("Failed to connect to server: " + err.message);
    } finally {
        refineBtn.disabled = false;
        refineBtn.innerHTML = "<span>Process Feedback & Synthesize Questions</span>";
    }
}

function togglePreviewCardState(idx) {
    const card = document.getElementById(`previewCard_${idx}`);
    const check = document.getElementById(`checkRefined_${idx}`);
    if (card && check) {
        if (check.checked) {
            card.classList.remove("deselected");
        } else {
            card.classList.add("deselected");
        }
    }
}


async function commitRefinedQuestions() {
    if (!activeQuestionsRole || refinedQuestionsPreviewList.length === 0) return;
    
    const commitBtn = document.getElementById("commitFeedbackBtn");
    commitBtn.disabled = true;
    commitBtn.textContent = "Saving...";
    
    const approvedQuestions = [];
    refinedQuestionsPreviewList.forEach((q, idx) => {
        const checkbox = document.getElementById(`checkRefined_${idx}`);
        const cleanInput = document.getElementById(`cleanInput_${idx}`);
        
        if (checkbox && checkbox.checked && cleanInput) {
            approvedQuestions.push({
                raw_text: q.raw_text,
                clean_text: cleanInput.value.trim(),
                matched_id: q.matched_id
            });
        }
    });
    
    if (approvedQuestions.length === 0) {
        alert("Please check at least one question to commit.");
        commitBtn.disabled = false;
        commitBtn.textContent = "Confirm & Sync to DB";
        return;
    }
    
    try {
        const res = await fetch("/api/question-bank/commit-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role_id: activeQuestionsRole, questions: approvedQuestions })
        });
        
        const data = await res.json();
        if (res.ok) {
            alert(`Successfully synchronized! ${data.inserted} inserted, ${data.updated} updated. ${data.purged > 0 ? `Capping rule triggered: purged ${data.purged} oldest active questions.` : ""}`);
            
            // Clean state and switch back to pack tab
            document.getElementById("rawNotesInput").value = "";
            document.getElementById("feedbackPreviewArea").style.display = "none";
            document.getElementById("previewQuestionsList").innerHTML = "";
            refinedQuestionsPreviewList = [];
            
            switchQuestionsTab("pack");
        } else {
            alert("Error committing: " + (data.detail || "Server error"));
        }
    } catch (err) {
        alert("Connection failed: " + err.message);
    } finally {
        commitBtn.disabled = false;
        commitBtn.textContent = "Confirm & Sync to DB";
    }
}

// ── SUBTAB 3: GENERIC CRUD ───────────────────────────────────────────────────

async function loadGenericQuestions() {
    if (!activeQuestionsRole) return;
    
    const tbody = document.getElementById("genericQuestionsTableBody");
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Loading generic questions...</td></tr>';
    
    try {
        const res = await fetch(`/api/question-bank/generic?role_id=${encodeURIComponent(activeQuestionsRole)}`);
        const data = await res.json();
        
        const questions = data.questions || [];
        if (questions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No static generic questions defined for this role.</td></tr>';
            return;
        }
        
        tbody.innerHTML = questions.map(q => `
            <tr id="genRow_${q.id}">
                <td style="vertical-align:middle;">
                    <span class="gen-text-span" id="genTextSpan_${q.id}">${escHtml(q.question_text)}</span>
                    <div class="gen-edit-container" id="genEditContainer_${q.id}" style="display:none; margin-top:0.25rem;">
                        <textarea class="gen-edit-input form-textarea" id="genEditInput_${q.id}" rows="2" style="width:100%; box-sizing:border-box;">${escHtml(q.question_text)}</textarea>
                    </div>
                </td>
                <td style="text-align:right; vertical-align:top; width:170px;">
                    <div class="gen-action-row" style="display:flex; justify-content:flex-end; gap:0.4rem;">
                        <button class="action-btn edit-btn" id="genEditBtn_${q.id}" onclick="toggleEditGeneric(${q.id})" style="padding:0.35rem 0.55rem; font-size:0.75rem;">
                            Edit
                        </button>
                        <button class="action-btn success save-btn" id="genSaveBtn_${q.id}" onclick="saveEditGeneric(${q.id})" style="display:none; padding:0.35rem 0.55rem; font-size:0.75rem; background:var(--emerald); border-color:var(--emerald);">
                            Save
                        </button>
                        <button class="action-btn cancel-btn" id="genCancelBtn_${q.id}" onclick="cancelEditGeneric(${q.id})" style="display:none; padding:0.35rem 0.55rem; font-size:0.75rem;">
                            Cancel
                        </button>
                        <button class="action-btn danger-btn delete-btn" id="genDelBtn_${q.id}" onclick="deleteGenericQuestion(${q.id})" style="padding:0.35rem 0.55rem; font-size:0.75rem;">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--red-err)">Failed to load generic questions.</td></tr>';
    }
}

async function saveGenericQuestion() {
    if (!activeQuestionsRole) return;
    
    const input = document.getElementById("addGenericQuestionInput");
    const text = input.value.trim();
    if (!text) {
        alert("Please enter at least one generic question.");
        input.focus();
        return;
    }
    
    try {
        const res = await fetch("/api/question-bank/generic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role_id: activeQuestionsRole, question_text: text })
        });
        
        if (res.ok) {
            const data = await res.json();
            input.value = "";
            await loadGenericQuestions();
            await loadQuestionBankRoles();
        } else {
            const errData = await res.json().catch(() => ({}));
            alert(errData.detail || "Failed to add question(s).");
        }
    } catch (err) {
        alert("Connection error: " + err.message);
    }
}

function toggleEditGeneric(id) {
    const span = document.getElementById(`genTextSpan_${id}`);
    const editContainer = document.getElementById(`genEditContainer_${id}`);
    const editInput = document.getElementById(`genEditInput_${id}`);
    const row = document.getElementById(`genRow_${id}`);
    const editBtn = document.getElementById(`genEditBtn_${id}`);
    const saveBtn = document.getElementById(`genSaveBtn_${id}`);
    const cancelBtn = document.getElementById(`genCancelBtn_${id}`);
    const delBtn = document.getElementById(`genDelBtn_${id}`);
    
    if (span) span.style.display = "none";
    if (editContainer) editContainer.style.display = "block";
    if (row) row.classList.add("editing-row");
    if (editBtn) editBtn.style.display = "none";
    if (delBtn) delBtn.style.display = "none";
    if (saveBtn) saveBtn.style.display = "inline-block";
    if (cancelBtn) cancelBtn.style.display = "inline-block";
    if (editInput) {
        editInput.focus();
        editInput.setSelectionRange(editInput.value.length, editInput.value.length);
    }
}

function cancelEditGeneric(id) {
    const span = document.getElementById(`genTextSpan_${id}`);
    const editContainer = document.getElementById(`genEditContainer_${id}`);
    const editInput = document.getElementById(`genEditInput_${id}`);
    const row = document.getElementById(`genRow_${id}`);
    const editBtn = document.getElementById(`genEditBtn_${id}`);
    const saveBtn = document.getElementById(`genSaveBtn_${id}`);
    const cancelBtn = document.getElementById(`genCancelBtn_${id}`);
    const delBtn = document.getElementById(`genDelBtn_${id}`);
    
    if (span) {
        span.style.display = "inline";
        if (editInput) editInput.value = span.textContent;
    }
    if (editContainer) editContainer.style.display = "none";
    if (row) row.classList.remove("editing-row");
    if (editBtn) editBtn.style.display = "inline-block";
    if (delBtn) delBtn.style.display = "inline-block";
    if (saveBtn) saveBtn.style.display = "none";
    if (cancelBtn) cancelBtn.style.display = "none";
}

async function saveEditGeneric(id) {
    const input = document.getElementById(`genEditInput_${id}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) {
        alert("Question text cannot be empty.");
        input.focus();
        return;
    }
    
    try {
        const res = await fetch(`/api/question-bank/generic/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question_text: text })
        });
        
        if (res.ok) {
            await loadGenericQuestions();
        } else {
            alert("Failed to save changes.");
        }
    } catch (err) {
        alert("Connection error: " + err.message);
    }
}


async function deleteGenericQuestion(id) {
    if (!confirm("Are you sure you want to delete this generic question?")) return;
    
    try {
        const res = await fetch(`/api/question-bank/generic/${id}`, { method: "DELETE" });
        if (res.ok) {
            await loadGenericQuestions();
        } else {
            alert("Failed to delete question.");
        }
    } catch (err) {
        alert("Connection error: " + err.message);
    }
}

// --- Drag & Drop Initialization ---
document.addEventListener("DOMContentLoaded", function () {
    // Feedback Excel Zone
    const feedbackZone = document.getElementById("feedbackUploadZone");
    if (feedbackZone) {
        feedbackZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            feedbackZone.classList.add("dragover");
        });
        feedbackZone.addEventListener("dragleave", () => {
            feedbackZone.classList.remove("dragover");
        });
        feedbackZone.addEventListener("drop", (e) => {
            e.preventDefault();
            feedbackZone.classList.remove("dragover");
            const file = e.dataTransfer.files[0];
            if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
                _doFeedbackUpload(file);
            } else {
                alert("Please drop a valid .xlsx file.");
            }
        });
    }

    // Client Profile CV Drop Zone
    const clientCvZone = document.getElementById("clientCvUploadZone");
    const clientCvInput = document.getElementById("clientCvFileInput");
    if (clientCvZone && clientCvInput) {
        clientCvZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            clientCvZone.classList.add("dragover");
        });
        clientCvZone.addEventListener("dragleave", () => {
            clientCvZone.classList.remove("dragover");
        });
        clientCvZone.addEventListener("drop", (e) => {
            e.preventDefault();
            clientCvZone.classList.remove("dragover");
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const dt = new DataTransfer();
                dt.items.add(e.dataTransfer.files[0]);
                clientCvInput.files = dt.files;
                onClientCvFileSelected(clientCvInput);
            }
        });
    }

    // Client Profile JD Drop Zone
    const clientJdZone = document.getElementById("clientJdUploadZone");
    const clientJdInput = document.getElementById("clientJdFileInput");
    if (clientJdZone && clientJdInput) {
        clientJdZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            clientJdZone.classList.add("dragover");
        });
        clientJdZone.addEventListener("dragleave", () => {
            clientJdZone.classList.remove("dragover");
        });
        clientJdZone.addEventListener("drop", (e) => {
            e.preventDefault();
            clientJdZone.classList.remove("dragover");
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const dt = new DataTransfer();
                dt.items.add(e.dataTransfer.files[0]);
                clientJdInput.files = dt.files;
                onClientJdFileSelected(clientJdInput);
            }
        });
    }
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
            <span>Processing <strong>${escHtml(file.name)}</strong>... Storing candidate feedback into SQLite dataset store</span>
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
                    <strong>${data.processed}</strong> feedback records saved to SQLite dataset store
                    ${data.skipped > 0 ? `<span class="upload-skipped">(${data.skipped} rows skipped — missing status/feedback)</span>` : ""}
                    <div class="upload-roles-found">${rolesHtml}</div>
                </div>
            </div>
        `;

        // Reload stats and sidebar datasets
        await loadFeedbackStats();
        await loadSavedDatasets();

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

// --- Load Feedback Stats & Role Badges ---
async function loadFeedbackStats() {
    const panel = document.getElementById("feedbackStatsPanel");
    const badgesList = document.getElementById("roleBadgesList");
    
    try {
        const res = await fetch("/api/feedback-stats");
        const data = await res.json();

        if (!data.total || data.total === 0) {
            if (panel) panel.style.display = "none";
            if (badgesList) badgesList.innerHTML = `<span class="role-badge-empty">Upload an Excel sheet to view role chips</span>`;
            return;
        }

        const roles = data.roles;
        const roleKeys = Object.keys(roles);

        // Update Role Chips for quick filtering
        const chipsHtml = roleKeys.map(role => `
            <button class="role-chip-btn" onclick="selectRoleChip('${escHtml(role)}')">
                <span>${escHtml(role)}</span>
                <span class="chip-count-tag">${roles[role].total}</span>
            </button>
        `).join("");

        if (badgesList && (!selectedDatasetId || selectedDatasetId === "all")) {
            badgesList.innerHTML = chipsHtml;
        }

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

        if (panel) {
            panel.style.display = "block";
            panel.innerHTML = `
                <div class="stats-header">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    SQLite Intelligence Store — ${data.total} records across ${roleKeys.length} roles
                </div>
                <div class="stats-roles-grid">${roleCards}</div>
            `;
        }
    } catch (err) {
        if (panel) panel.style.display = "none";
    }
}

// ── SAVED FEEDBACK DATASETS & EXCEL SHEET FILTER ──────────────────────────

let allFeedbackDatasets = [];
let selectedDatasetId = "all";

async function loadSavedDatasets() {
    try {
        const res = await fetch("/api/feedback-datasets");
        if (!res.ok) return;
        allFeedbackDatasets = await res.json();
        renderSavedDatasets(allFeedbackDatasets);
        populateExcelDatasetFilterDropdown(allFeedbackDatasets);
    } catch (err) {
        console.error("Failed to load feedback datasets:", err);
    }
}

function renderSavedDatasets(datasets) {
    const listContainer = document.getElementById("savedFeedbackList");
    const emptyEl = document.getElementById("savedFeedbackEmpty");
    if (!listContainer) return;

    // Clear existing cards
    Array.from(listContainer.querySelectorAll(".saved-jd-card")).forEach(el => el.remove());

    if (!datasets || datasets.length === 0) {
        if (emptyEl) emptyEl.style.display = "flex";
        return;
    }
    if (emptyEl) emptyEl.style.display = "none";

    datasets.forEach(ds => {
        const card = document.createElement("div");
        card.className = `saved-jd-card saved-feedback-card ${selectedDatasetId == ds.id ? 'active' : ''}`;
        card.dataset.id = ds.id;

        const date = new Date(ds.created_at);
        const dateStr = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

        card.innerHTML = `
            <div class="saved-jd-card-title" title="${escHtml(ds.filename)}">${escHtml(ds.filename)}</div>
            <div class="saved-jd-card-date">${ds.row_count} rows · ${dateStr}</div>
            <div class="saved-jd-keywords" style="margin-top:2px;">
                <span class="saved-jd-kw" style="background:rgba(52, 211, 153, 0.12); color:#34d399; border-color:rgba(52, 211, 153, 0.2);">
                    ${ds.roles ? ds.roles.length : 0} roles
                </span>
            </div>
            <button class="saved-jd-delete" title="Delete Dataset" onclick="deleteFeedbackDataset(${ds.id}, event)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        card.addEventListener("click", (e) => {
            if (e.target.closest(".saved-jd-delete")) return;
            selectDatasetFilter(ds.id);
        });

        listContainer.appendChild(card);
    });
}

function populateExcelDatasetFilterDropdown(datasets) {
    const select = document.getElementById("excelDatasetFilterSelect");
    if (!select) return;

    const currentVal = select.value || "all";
    let optionsHtml = `<option value="all">All Excel Sheets (${datasets.reduce((acc, d) => acc + d.row_count, 0)} records)</option>`;

    datasets.forEach(ds => {
        optionsHtml += `<option value="${ds.id}">${escHtml(ds.filename)} (${ds.row_count} rows)</option>`;
    });

    select.innerHTML = optionsHtml;
    select.value = currentVal;
}

function onDatasetFilterChange(val) {
    selectedDatasetId = val;
    // Highlight sidebar active dataset
    const cards = document.querySelectorAll(".saved-feedback-card");
    cards.forEach(c => c.classList.remove("active"));
    if (val !== "all") {
        const activeCard = Array.from(cards).find(c => c.dataset.id == val);
        if (activeCard) activeCard.classList.add("active");
    }
    filterRolesByDataset(val);
}

function selectDatasetFilter(datasetId) {
    const select = document.getElementById("excelDatasetFilterSelect");
    if (select) {
        select.value = datasetId;
        onDatasetFilterChange(datasetId);
    }
}

function filterRolesByDataset(datasetId) {
    const badgesList = document.getElementById("roleBadgesList");
    if (!badgesList) return;

    if (datasetId === "all" || !allFeedbackDatasets.length) {
        selectedDatasetId = "all";
        loadFeedbackStats(); // Reload full role chips list
        return;
    }

    const ds = allFeedbackDatasets.find(d => d.id == datasetId);
    if (!ds || !ds.roles || ds.roles.length === 0) {
        badgesList.innerHTML = `<span class="role-badge-empty">No roles found in this sheet</span>`;
        return;
    }

    badgesList.innerHTML = ds.roles.map(role => `
        <button class="role-chip-btn" onclick="selectRoleChip('${escHtml(role)}')">
            <span>${escHtml(role)}</span>
            <span class="chip-count-tag" style="background:rgba(52, 211, 153, 0.2); color:#34d399;">Sheet ${ds.id}</span>
        </button>
    `).join("");
}

async function deleteFeedbackDataset(id, event) {
    if (event) event.stopPropagation();
    if (!confirm("Delete this saved feedback sheet? This action cannot be undone.")) return;

    try {
        const res = await fetch(`/api/feedback-datasets/${id}`, { method: "DELETE" });
        if (res.ok) {
            await loadSavedDatasets();
            await loadFeedbackStats();
        } else {
            alert("Failed to delete dataset.");
        }
    } catch (err) {
        alert("Error deleting dataset: " + err.message);
    }
}

function selectRoleChip(roleName) {
    const input = document.getElementById("intelRoleInput");
    if (input) {
        input.value = roleName;
        queryRejectionTrends();
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
            <span>Synthesizing rejection trends for <strong>${escHtml(role)}</strong> via Gemma 31B Context Window...</span>
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
    if (!confirm("Are you sure you want to clear all candidate feedback from the intelligence store? This action cannot be undone.")) {
        return;
    }

    try {
        const res = await fetch("/api/clear-feedback", { method: "POST" });
        const data = await res.json();

        if (res.ok) {
            alert(data.message || "Feedback store cleared successfully.");
            
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

            await loadSavedDatasets();
            await loadFeedbackStats();
        } else {
            alert("Error clearing feedback store: " + (data.detail || "Server error"));
        }
    } catch (err) {
        alert("Failed to connect to server: " + err.message);
    }
}

// Initial load on page ready
document.addEventListener("DOMContentLoaded", function () {
    loadSavedJDs();
    loadSavedDatasets();
    loadFeedbackStats();
});
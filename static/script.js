let currentSuspectId = null;
let currentSuspectName = "";
let currentCaseData = null;

// --- MAIN MENU ---
async function loadCases() {
    const response = await fetch('/api/cases');
    const cases = await response.json();

    const list = document.getElementById('case-list');
    list.innerHTML = '';

    cases.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'case-btn';
        btn.innerHTML = `<strong>${c.title}</strong> <br><small style="color:#aaa;">Difficulty: ${c.difficulty.toUpperCase()}</small>`;
        btn.onclick = () => selectCase(c.id);
        list.appendChild(btn);
    });
}

async function selectCase(caseId) {
    await fetch('/api/start_case', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseId })
    });

    document.getElementById('main-menu').style.display = 'none';

    const response = await fetch('/api/case_info');
    currentCaseData = await response.json();

    showCaseModal(true);
    loadSuspects();
    loadEvidence();
    loadChatHistory(); // Load history when starting a case
}

function showCaseModal(isStarting) {
    document.getElementById('case-modal').style.display = 'flex';
    document.getElementById('modal-title').innerText = currentCaseData.title;
    document.getElementById('modal-summary').innerText = currentCaseData.case_summary;
    document.getElementById('modal-victim').innerText = currentCaseData.victim_name;
    document.getElementById('modal-time').innerText = currentCaseData.time_of_death;
    document.getElementById('modal-location').innerText = currentCaseData.location;
    document.getElementById('modal-background').innerText = currentCaseData.background;
    document.getElementById('header-case-title').innerText = currentCaseData.title;

    const relList = document.getElementById('modal-relationships');
    relList.innerHTML = '';
    if (currentCaseData.victim_relationships) {
        currentCaseData.victim_relationships.forEach(rel => {
            relList.innerHTML += `<li>${rel}</li>`;
        });
    }

    const actionBtn = document.getElementById('modal-action-btn');
    if (isStarting) {
        actionBtn.innerText = "Begin Investigation";
        actionBtn.onclick = startGame;
    } else {
        actionBtn.innerText = "Resume Investigation";
        actionBtn.onclick = closeCaseFile;
    }
}

function startGame() { document.getElementById('case-modal').style.display = 'none'; }
function openCaseFile() { if (currentCaseData) showCaseModal(false); }
function closeCaseFile() { document.getElementById('case-modal').style.display = 'none'; }

// --- GAMEPLAY ---
async function loadSuspects() {
    const response = await fetch('/api/suspects');
    const suspects = await response.json();

    const list = document.getElementById('suspect-list');
    list.innerHTML = '';

    suspects.forEach(suspect => {
        const card = document.createElement('div');
        card.className = 'suspect-card';
        card.innerHTML = `<strong>${suspect.name}</strong><br><small>${suspect.role}</small>`;
        card.onclick = () => selectSuspect(suspect);
        list.appendChild(card);
    });
}

function selectSuspect(suspect) {
    currentSuspectId = suspect.id;
    currentSuspectName = suspect.name;

    document.getElementById('current-suspect-name').innerText = suspect.name;
    document.getElementById('stats-container').classList.remove('hidden');
    document.getElementById('trust-val').innerText = suspect.trust;
    document.getElementById('suspicion-val').innerText = suspect.suspicion;
    document.getElementById('chat-input').disabled = false;
    document.getElementById('send-btn').disabled = false;

    // DON'T clear the chat box! Just add a system divider.
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML += `<div class="message system">--- You approached ${suspect.name} ---</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message || !currentSuspectId) return;

    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML += `<div class="message player">${message}</div>`;
    input.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch('/api/interrogate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ suspect_id: currentSuspectId, message: message })
        });

        const data = await response.json();

        if (data.error) {
            chatBox.innerHTML += `<div class="message system">Error: ${data.error}</div>`;
            return;
        }

        // Show who is talking in the chat bubble
        chatBox.innerHTML += `<div class="message suspect"><strong>${currentSuspectName}:</strong><br>${data.dialogue}</div>`;

        document.getElementById('trust-val').innerText = data.updated_state.trust;
        document.getElementById('suspicion-val').innerText = data.updated_state.suspicion;

        if (data.game_event) {
            chatBox.innerHTML += `<div class="message alert">${data.game_event}</div>`;
            loadEvidence();
        }
        chatBox.scrollTop = chatBox.scrollHeight;

    } catch (error) {
        chatBox.innerHTML += `<div class="message system">Connection error.</div>`;
    }
}

// --- EVIDENCE BOARD ---
async function loadEvidence() {
    const response = await fetch('/api/state');
    const state = await response.json();

    const evidenceList = document.getElementById('evidence-list');
    evidenceList.innerHTML = '';

    state.detailed_evidence.forEach(ev => {
        evidenceList.innerHTML += `
            <div class="evidence-card">
                <h3>${ev.name}</h3>
                <p>${ev.description}</p>
            </div>
        `;
    });
}

// --- CHAT HISTORY (New Function) ---
async function loadChatHistory() {
    const response = await fetch('/api/state');
    const state = await response.json();

    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '<div class="message system">Case initiated. Select a suspect to begin.</div>';

    if (state.chat_log) {
        state.chat_log.forEach(msg => {
            if (msg.role === 'player') {
                chatBox.innerHTML += `<div class="message player">${msg.text}</div>`;
            } else if (msg.role === 'alert') {
                chatBox.innerHTML += `<div class="message alert">${msg.text}</div>`;
            } else {
                // Find the suspect's name for the bubble
                chatBox.innerHTML += `<div class="message suspect"><strong>Suspect:</strong><br>${msg.text}</div>`;
            }
        });
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- ACCUSATION SYSTEM ---
async function openAccusation() {
    const response = await fetch('/api/state');
    const state = await response.json();

    const list = document.getElementById('accuse-list');
    list.innerHTML = '';

    state.suspects_list.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'case-btn';
        btn.innerText = `Accuse ${s.name}`;
        btn.onclick = () => submitAccusation(s.id);
        list.appendChild(btn);
    });

    document.getElementById('accuse-modal').style.display = 'flex';
}

function closeAccusation() { document.getElementById('accuse-modal').style.display = 'none'; }

async function submitAccusation(suspectId) {
    closeAccusation();
    const response = await fetch('/api/accuse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspect_id: suspectId })
    });
    const data = await response.json();

    // 1. Get the End Game elements
    const endModal = document.getElementById('endgame-modal');
    const endContent = document.getElementById('endgame-content');
    const endTitle = document.getElementById('endgame-title');
    const endMessage = document.getElementById('endgame-message');

    // 2. Clear old styles and apply new ones based on Win/Loss
    endContent.className = 'modal-content';

    if (data.success) {
        endContent.classList.add('win');
        endTitle.innerText = "CASE CLOSED";
        endMessage.innerText = data.message;
    } else {
        endContent.classList.add('lose');
        endTitle.innerText = "CASE FAILED";
        endMessage.innerText = data.message;
    }

    // 3. Show the screen
    endModal.style.display = 'flex';
}

// 4. Function to reset everything and go back to the start
function returnToMenu() {
    // Reloading the page is the cleanest way to clear all state, chats, and memory for a fresh game
    window.location.reload();
}

// --- INITIALIZATION ---
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

loadCases();

function enterMainMenu() {
    // Hide the home screen
    document.getElementById('home-modal').style.display = 'none';
    // Show the case selection screen
    document.getElementById('main-menu').style.display = 'flex';
}

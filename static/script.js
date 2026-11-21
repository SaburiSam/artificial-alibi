let currentSuspectId = null;
let currentSuspectName = "";
let currentCaseData = null;

// --- MAIN MENU ---
async function loadCases() {
    const response = await fetch('/api/cases');
    let cases = await response.json();
    
    // Define the difficulty order
    const difficultyWeight = { 'EASY': 1, 'MEDIUM': 2, 'HARD': 3 };

    // Sort cases by difficulty, then alphabetically by title
    cases.sort((a, b) => {
        const weightA = difficultyWeight[a.difficulty.toUpperCase()] || 99;
        const weightB = difficultyWeight[b.difficulty.toUpperCase()] || 99;
        if (weightA !== weightB) return weightA - weightB;
        return a.title.localeCompare(b.title);
    });

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

// --- HOME SCREEN ---
function enterMainMenu() {
    document.getElementById('home-modal').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
}

async function selectCase(caseId) {
    await fetch('/api/start_case', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseId })
    });

    document.getElementById('main-menu').style.display = 'none';

    const response = await fetch('/api/case_info', { cache: 'no-store' });
    currentCaseData = await response.json();

    showCaseModal(true);
    loadSuspects();
    loadEvidence();
    loadChatHistory(); 
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
    const response = await fetch('/api/suspects', { cache: 'no-store' });
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
    // ADDED CACHE NO-STORE HERE
    const response = await fetch('/api/state', { cache: 'no-store' });
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

// --- CHAT HISTORY ---
async function loadChatHistory() {
    // ADDED CACHE NO-STORE HERE
    const response = await fetch('/api/state', { cache: 'no-store' });
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
                chatBox.innerHTML += `<div class="message suspect"><strong>Suspect:</strong><br>${msg.text}</div>`;
            }
        });
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- ACCUSATION SYSTEM ---
async function openAccusation() {
    // ADDED CACHE NO-STORE HERE
    const response = await fetch('/api/state', { cache: 'no-store' });
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

    const endModal = document.getElementById('endgame-modal');
    const endContent = document.getElementById('endgame-content');
    const endTitle = document.getElementById('endgame-title');
    const endMessage = document.getElementById('endgame-message');

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

    endModal.style.display = 'flex';
}

function returnToMenu() {
    window.location.reload();
}

// --- INITIALIZATION ---
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

loadCases();

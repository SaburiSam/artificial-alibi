import json
import os
from pathlib import Path
from flask import Flask, jsonify, request, render_template
from dotenv import load_dotenv
from google import genai
from google.genai import types
import schemas

# 1. Load the API key
load_dotenv()
API_KEY = os.environ.get("GEMINI_API_KEY")

# 2. Initialize Flask
app = Flask(__name__)

# --- DYNAMIC CASE LOADING ---
CASES_DIR = Path("data")
ALL_CASES = {}
for case_folder in CASES_DIR.iterdir():
    if case_folder.is_dir():
        bible_path = case_folder / "case_bible.json"
        if bible_path.exists():
            with open(bible_path, "r", encoding="utf-8") as f:
                case_data = json.load(f)
                ALL_CASES[case_data["case_id"]] = case_data

ACTIVE_CASE_ID = "case_001"
CASE_BIBLE = ALL_CASES[ACTIVE_CASE_ID]

def reset_game_state(case_id):
    global ACTIVE_CASE_ID, CASE_BIBLE, GAME_STATE
    ACTIVE_CASE_ID = case_id
    CASE_BIBLE = ALL_CASES[case_id]
    
    GAME_STATE = {
        "case_id": CASE_BIBLE["case_id"],
        "title": CASE_BIBLE["title"],
        "unlocked_evidence": [],
        "suspect_status": {s["id"]: {"trust": s["initial_trust"], "suspicion": s["initial_suspicion"]} for s in CASE_BIBLE["suspects"]},
        "game_over": False,
        "player_won": False,
        "chat_log": [],
        "suspect_chats": {}
    }
    
    for ev in CASE_BIBLE["evidence"]:
        if ev["unlock_condition"]["type"] == "default" and ev["unlock_condition"]["value"]:
            GAME_STATE["unlocked_evidence"].append(ev["id"])

reset_game_state(ACTIVE_CASE_ID)

def get_suspect(suspect_id):
    for s in CASE_BIBLE["suspects"]:
        if s["id"] == suspect_id:
            return s
    return None

@app.route("/api/cases")
def list_cases():
    case_list = [{"id": c["case_id"], "title": c["title"], "difficulty": c["difficulty"]} for c in ALL_CASES.values()]
    return jsonify(case_list)

@app.route("/api/start_case", methods=["POST"])
def start_case():
    data = request.json
    case_id = data.get("case_id")
    if case_id in ALL_CASES:
        reset_game_state(case_id)
        return jsonify({"success": True})
    return jsonify({"error": "Case not found"}), 404

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/state")
def get_state():
    detailed_evidence = []
    for ev_id in GAME_STATE["unlocked_evidence"]:
        for ev in CASE_BIBLE["evidence"]:
            if ev["id"] == ev_id:
                detailed_evidence.append(ev)
                break

    suspects_list = [{"id": s["id"], "name": s["name"]} for s in CASE_BIBLE["suspects"]]

    return jsonify({
        **GAME_STATE,
        "detailed_evidence": detailed_evidence,
        "suspects_list": suspects_list
    })

@app.route("/api/suspects")
def get_suspects():
    safe_suspects = []
    for s in CASE_BIBLE["suspects"]:
        safe_suspect = {
            "id": s["id"], "name": s["name"], "role": s["role"],
            "motive": s["motive"], "alibi": s["alibi"],
            "trust": GAME_STATE["suspect_status"][s["id"]]["trust"],
            "suspicion": GAME_STATE["suspect_status"][s["id"]]["suspicion"]
        }
        safe_suspects.append(safe_suspect)
    return jsonify(safe_suspects)

@app.route("/api/case_info")
def get_case_info():
    return jsonify({
        "title": CASE_BIBLE["title"],
        "victim_name": CASE_BIBLE["victim"]["name"],
        "time_of_death": CASE_BIBLE["victim"]["time_of_death"],
        "location": CASE_BIBLE["victim"]["location"],
        "background": CASE_BIBLE["victim"]["background"],
        "case_summary": CASE_BIBLE["case_summary"],
        "victim_relationships": CASE_BIBLE["victim"].get("victim_relationships", [])
    })

@app.route("/api/interrogate", methods=["POST"])
def interrogate():
    data = request.json
    suspect_id = data.get("suspect_id")
    player_message = data.get("message")

    if not suspect_id or not player_message:
        return jsonify({"error": "Missing suspect_id or message"}), 400

    suspect = get_suspect(suspect_id)
    if not suspect:
        return jsonify({"error": "Suspect not found"}), 404

    GAME_STATE["chat_log"].append({"suspect_id": suspect_id, "role": "player", "text": player_message})

    if suspect_id not in GAME_STATE["suspect_chats"]:
        GAME_STATE["suspect_chats"][suspect_id] = []

    # Find the EXACT statement_key this suspect is supposed to say if they lie
    expected_statement = "none"
    for c in CASE_BIBLE.get("contradictions", []):
        if c["suspect_id"] == suspect_id:
            expected_statement = c["statement_key"]

    system_prompt = f"""
    You are {suspect['name']}, the {suspect['role']}.
    You are being interrogated by a detective about the murder of {CASE_BIBLE['victim']['name']}.

    CASE CONTEXT: {CASE_BIBLE['case_summary']}
    YOUR PROFILE: Motive: {suspect['motive']} | Alibi: {suspect['alibi']}
    YOUR RELATIONSHIPS: {suspect.get('relationships', 'You only care about yourself.')}

    RULES:
    1. NEVER confess to the murder directly.
    2. You are defensive, BUT if the detective presses you politely, you are willing to gossip about others.
    3. Keep dialogue short (1-3 sentences).
    4. NEVER say the 'statement_key' out loud. Speak naturally.
    5. If the detective mentions anything about your alibi or asks where you were, you MUST set the statement_key to exactly '{expected_statement}'.
    """

    try:
        client = genai.Client(api_key=API_KEY, http_options={'api_version': 'v1beta'})

        history = []
        for msg in GAME_STATE["suspect_chats"][suspect_id]:
            history.append(types.Content(role=msg["role"], parts=[types.Part.from_text(text=msg["text"])]))
        history.append(types.Content(role="user", parts=[types.Part.from_text(text=player_message)]))

        response = client.models.generate_content(
            model='gemini-3.5-flash-lite',
            contents=history,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=schemas.SuspectResponse,
                temperature=0.7,
            ),
        )

        ai_result = json.loads(response.text)
        
        GAME_STATE["suspect_chats"][suspect_id].append({"role": "user", "text": player_message})
        GAME_STATE["suspect_chats"][suspect_id].append({"role": "model", "text": ai_result["dialogue"]})
        GAME_STATE["chat_log"].append({"suspect_id": suspect_id, "role": "suspect", "text": ai_result["dialogue"]})

        current_status = GAME_STATE["suspect_status"][suspect_id]
        current_status["trust"] = max(0, min(100, current_status["trust"] + ai_result["trust_delta"]))
        current_status["suspicion"] = max(0, min(100, current_status["suspicion"] + ai_result["suspicion_delta"]))

        game_event = None
        ai_statement = ai_result["statement_key"]
        player_msg_lower = player_message.lower()

        for contradiction in CASE_BIBLE.get("contradictions", []):
            if contradiction["suspect_id"] == suspect_id:
                keywords = contradiction.get("player_must_say", [])
                # Made the keyword matching more forgiving
                player_presented_evidence = any(k in player_msg_lower for k in keywords)

                if player_presented_evidence and (contradiction["statement_key"] in ai_statement or ai_statement in contradiction["statement_key"] or ai_statement == expected_statement):
                    unlock_id = contradiction.get("unlocks_evidence")
                    if unlock_id and unlock_id not in GAME_STATE["unlocked_evidence"]:
                        GAME_STATE["unlocked_evidence"].append(unlock_id)
                        current_status["trust"] = max(0, current_status["trust"] + contradiction["trust_delta"])
                        current_status["suspicion"] = min(100, current_status["suspicion"] + contradiction["suspicion_delta"])
                        game_event = f"CONTRADICTION! Suspect caught in a lie. New evidence unlocked: {unlock_id}"
                        GAME_STATE["chat_log"].append({"suspect_id": "system", "role": "alert", "text": game_event})
                        break

        return jsonify({
            "dialogue": ai_result["dialogue"],
            "updated_state": current_status,
            "game_event": game_event
        })
    except Exception as e:
        return jsonify({"error": f"AI Error: {str(e)}"}), 500

@app.route("/api/accuse", methods=["POST"])
def accuse():
    data = request.json
    accused_id = data.get("suspect_id")

    actual_murderer_id = CASE_BIBLE["solution"]["murderer_id"]
    required_evidence = CASE_BIBLE["solution"]["required_evidence"]
    
    # Get the actual murderer's name for the message
    actual_murderer_name = next((s["name"] for s in CASE_BIBLE["suspects"] if s["id"] == actual_murderer_id), "Unknown")

    has_evidence = all(ev in GAME_STATE["unlocked_evidence"] for ev in required_evidence)

    if accused_id == actual_murderer_id and has_evidence:
        GAME_STATE["game_over"] = True
        GAME_STATE["player_won"] = True
        return jsonify({"success": True, "message": f"You solved the case! {actual_murderer_name} did it."})
    elif accused_id == actual_murderer_id and not has_evidence:
        return jsonify({"success": False, "message": "You accused the right person, but you don't have enough evidence to convict them!"})
    else:
        GAME_STATE["game_over"] = True
        GAME_STATE["player_won"] = False
        return jsonify({"success": False, "message": f"Wrong accusation! {actual_murderer_name} got away with it."})

if __name__ == "__main__":
    app.run(debug=True, port=5000)

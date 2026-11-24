# Vapi Voice AI Configuration Guide (For Live Calling & Lead Qualification)

This platform supports **both**:
1. **Interactive Simulation Mode (Default & Zero-Cost)**: 100% deterministic calling simulation with customer dialog turns, appointment booking, opt-out compliance triggers, and ledger transactions. Works out-of-the-box without keys.
2. **Live Vapi Telephony Mode**: Integrates with [Vapi.ai](https://vapi.ai) to place actual outbound voice calls and receive real-time webhook analysis.

---

## 1. Required Environment Variables (`.env`)

Add or update these keys in your `.env` file:

```env
# 1. Private API Key from Vapi Dashboard
VAPI_API_KEY="your-vapi-private-api-key"

# 2. Created Assistant ID
VAPI_ASSISTANT_ID="your-vapi-assistant-uuid"

# 3. Telephony Phone Number ID (from Vapi Phone Numbers page)
VAPI_PHONE_NUMBER_ID="your-vapi-phone-number-uuid"

# 4. Webhook Signing Secret (Optional but recommended for verifying inbound hooks)
VAPI_WEBHOOK_SECRET="whsec_vapi_voice_ai_lead_qualification_audit"
```

---

## 2. Vapi Assistant Configuration (Inside https://dashboard.vapi.ai)

When creating or configuring your Assistant in Vapi, use these settings:

### A. First Message
```text
Hi {{first_name}}, this is {{agent_name}}, an AI assistant calling from {{company}} regarding your recent inquiry. Do you have a quick minute?
```
*(The platform automatically injects `first_name`, `agent_name`, and `company` per sub-account!)*

### B. System Prompt
```text
You are {{agent_name}}, an AI voice qualification representative for {{company}}.

OBJECTIVE:
- Qualify inbound homeowners or commercial prospects who requested estimates or inspections.
- Offer two immediate appointment slots and secure a booked date/time.
- Never make up pricing or structural guarantees.

LEGAL & TCPA COMPLIANCE:
- You must clearly state that you are an AI assistant and that the call may be recorded.
- If the customer says "stop calling", "do not call", "remove my number", or expresses clear unwillingness:
  1. Call the tool `flag_do_not_call` immediately.
  2. Apologize politely once: "Understood, I have updated our records and removed your number. Have a good day."
  3. End the call.

AVAILABLE TOOLS:
- `check_availability`: Call to retrieve available morning and afternoon inspection slots.
- `book_appointment`: Call when the lead confirms an appointment slot. Pass `slot` (e.g. "Tuesday 10:00 AM").
- `flag_do_not_call`: Call if the lead requests to be removed or placed on DNC.
- `transfer_to_human`: Call if the lead asks to speak to a licensed human manager or has an unresolved dispute.
```

### C. Recommended Model & Voice Settings
- **Model**: `gpt-4o` or `gpt-4o-mini` (or Claude 3.5 Sonnet)
- **Voice Provider**: ElevenLabs (`warm-female` or `rachel` / `charlie`) or Cartesia (`upbeat-sales`)
- **Transcriber**: Deepgram Nova-2 (US English)

---

## 3. What do you need for `VAPI_PHONE_NUMBER_ID`?

In Vapi, an outbound call requires a verified caller-ID or purchased number:

1. In your **Vapi Dashboard**, go to **Phone Numbers** (left sidebar).
2. You have two options:
   - **Option A (Instant Vapi Number)**: Click **"Buy Number"** (typically ~$2/month via Twilio integration inside Vapi). Choose an area code matching your target sub-account (e.g. `512` for Austin TX, `02` for Sydney AU).
   - **Option B (Bring Your Own Twilio/Vonage Number)**: Link your Twilio Account SID and Auth Token to Vapi under Phone Numbers.
3. Once the number appears in the table, click on it and copy the **ID** (a UUID like `e8a93d21-4f11-4bc1-...`).
4. Paste that UUID as `VAPI_PHONE_NUMBER_ID` in `.env`.

---

## 4. Server Webhook Endpoint Configuration

To have Vapi send post-call transcripts, appointment confirmations, and opt-out notifications back into your platform:

1. In your Vapi Assistant settings, set the **Server URL** (Webhook) to:
   ```text
   https://your-domain.vercel.app/api/webhooks/vapi
   ```
   *(For local testing with ngrok: `https://xxxx.ngrok-free.app/api/webhooks/vapi`)*
2. In **Server Events**, enable:
   - `status-update` (call started, ended)
   - `tool-calls` (check availability, book appointment, flag DNC)
   - `end-of-call-report` (full transcript, recording, cost, and duration)
3. Set the **Server Secret** to match your `VAPI_WEBHOOK_SECRET` in `.env`.

---

## 5. What Happens When Keys Are Missing?

If `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, or `VAPI_PHONE_NUMBER_ID` are empty:
- The platform **gracefully switches to Interactive Simulation Mode**.
- You can test:
  - ✅ **Interested & Books Appointment**: Shows real-time conversation, books slot, updates lead status, charges $0.24 FinOps cost.
  - ✅ **Customer Opt-Out / DNC**: Automatically triggers household DNC quarantine and blocks future dials across the cluster.
  - ✅ **Time-Window Gate Enforcement**: Demonstrates blocking when calling outside permissible local hours (e.g., 10 PM in Sydney).
  - ✅ **FinOps Circuit Breaker**: Blocks calls when tenant monthly budget is exceeded or paused.

Canvas-to-Realtime API Integration Report
1. Goal
Send the visible canvas as vision input so the tutor can see what the user is working on.
React to canvas changes in real time.
Add session controls (pause/resume, stop).
Optimize cost.
2. Technical Foundation
2.1 Canvas capture (tldraw)
The Canvas component exposes exportPNG() via ref, which uses editor.toImage(shapeIds, options). For viewport-only capture:
Use editor.getViewportScreenBounds() for viewport size.
Convert viewport bounds to page space with editor.screenToPage().
Use editor.toImage(shapes, { bounds: pageBounds }) or editor.getRenderingShapes() to get shapes in view, then export those.
toImage returns a Blob; convert to base64 for the Realtime API.
2.2 Realtime API image input
Images are sent via conversation.item.create with input_image:
{  "type": "conversation.item.create",  "item": {    "type": "message",    "role": "user",    "content": [{ "type": "input_image", "image_url": "data:image/png;base64,..." }]  }}
Each image becomes a conversation item and is included in every later response.
2.3 Cost model (gpt-realtime)
Modality	Input	Output
Text	$4.00 / 1M tokens	$16.00 / 1M
Audio	$32.00 / 1M tokens	$64.00 / 1M
Image	$5.00 / 1M tokens	—
Costs are charged when a Response is created.
The full conversation (including all images) is sent each time.
Images are ~85–255 tokens each (roughly ~170 tokens).
Per image: ~170 × $5 / 1M ≈ $0.00085.
If 10 images are in the conversation, each response pays for all 10.
3. Cost Scenarios
Scenario A: Continuous streaming (every 5 s)
12 images/min → 720 images in a 60 min session.
All images stay in the conversation.
After ~10 images, context is dominated by images and cost explodes.
Not viable.
Scenario B: On-change only (debounced)
Send only when canvas changes (e.g. 2 s debounce).
1-hour session with moderate drawing: ~30–60 images.
Still accumulates many images in context.
Expensive unless we replace old images.
Scenario C: Replace strategy (keep only latest canvas)
On each canvas update: delete previous canvas item, add new one.
Conversation always has at most one canvas image.
Cost per response: ~170 image tokens + audio/text.
Much cheaper and predictable.
Scenario D: On-speech only
Send canvas only when user starts speaking (VAD).
AI gets current canvas when the user asks.
Very few images per session.
Lowest cost; may miss context if user draws without speaking.
4. Recommended Strategy
4.1 Hybrid: on-change + replace + user toggle
Canvas streaming toggle
“Stream canvas to tutor” (on/off).
Off = voice/text only.
On = canvas sent when it changes or when user speaks.
On-change detection
Use tldraw editor.store.listen() or useValue on shape count / content hash.
Debounce 2–3 s to avoid bursts.
Replace strategy
Before adding a new canvas image, delete the previous canvas item.
Use a stable item_id or tag (e.g. canvas_context) so we can target it with conversation.item.delete.
Optional: on-speech
On input_audio_buffer.speech_started, send current canvas if streaming is on and canvas has content.
Ensures the tutor sees the board when the user starts talking.
4.2 Session controls
Control	Behavior
Stop session	Close WebRTC, clear state (same as current “End session”).
Pause session	Mute microphone; stop sending canvas; keep connection.
Resume session	Unmute; resume canvas streaming if enabled.
Pause canvas	Same as turning off “Stream canvas to tutor”.
Pause/resume can be implemented by:
Muting the audio track: track.enabled = false.
Stopping canvas capture and conversation.item.create for images.
5. Implementation Plan
Phase 1: Plumbing
Expose canvas capture from EmbeddedBoard
Add onCanvasSnapshot?: (base64: string) => void or expose captureViewport(): Promise<string> via ref/context.
Viewport capture helper
Use editor.getRenderingShapes() or viewport bounds.
Export with editor.toImage() (e.g. scale 1 for smaller images).
Return base64 PNG.
Extend useRealtimeTutor
Add sendCanvasImage(base64: string) that:
Deletes previous canvas item (if any).
Sends conversation.item.create with input_image.
Optionally add response.create only when you want an immediate reply (e.g. on explicit “Ask about canvas” action).
Phase 2: Change detection
useCanvasChangeDetection
Subscribe to editor.store.listen() or a derived “content changed” signal.
Debounce 2–3 s.
Call onChange when debounced change fires.
Integrate in tutor page
When onChange fires and streaming is on: call sendCanvasImage(captureViewport()).
Phase 3: UI
Tutor panel controls
“Stream canvas” toggle.
“Pause session” / “Resume session”.
“End session” (existing).
System prompt update
Instruct the model that it may receive periodic canvas images and should use them as context for the current work.
Phase 4: Cost controls
Replace-only policy
Always delete the previous canvas item before adding a new one.
Optional truncation
Use session.update with token_limits.post_instructions to cap context size.
Image size
Use scale: 1 or crop to a smaller viewport to reduce tokens.
6. Cost Estimate (optimized)
1-hour session, canvas streaming on, ~20 canvas updates (replace strategy).
~20 images total, but only 1 in context at a time.
~20 responses × (170 image + ~500 audio/text) ≈ 13.4k image tokens + audio/text.
Image cost: 13.4k × $5 / 1M ≈ $0.07 for images.
Audio dominates overall cost; canvas adds a small fraction.
7. File Changes Summary
File	Changes
components/Canvas.tsx	Add captureViewport(): Promise<string> to ref API
components/EmbeddedBoard.tsx	Expose canvas ref or callback for capture
hooks/useRealtimeTutor.ts	Add sendCanvasImage, pause, resume; track canvas item ID for replace
app/tutor/page.tsx	Add controls, wire canvas capture and change detection
hooks/useCanvasChangeDetection.ts	New hook for debounced change detection
app/api/realtime/token/route.ts	Update system prompt for canvas context
8. Open Decisions
Auto-response on canvas
Option A: Send canvas only as context (no response.create).
Option B: Trigger response.create when canvas is sent so the tutor proactively comments.
Recommendation: A for cost; B only if you want proactive feedback.
On-speech canvas
Send canvas when user starts speaking, in addition to on-change.
Improves relevance with minimal extra cost.
Pause vs. disconnect
Pause = mute + stop canvas; Resume = unmute + resume canvas.
Disconnect = full teardown.
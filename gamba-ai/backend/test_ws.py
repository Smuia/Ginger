"""Quick smoke test for the WebSocket /ws/audio endpoint."""
import asyncio
import json
import websockets


async def test_ws():
    uri = "ws://localhost:8000/ws/audio"
    async with websockets.connect(uri) as ws:
        # 1. Send start control frame
        await ws.send(json.dumps({
            "type": "start",
            "sampleRate": 16000,
            "mimeType": "audio/webm",
        }))
        print("-> Sent START")

        # 2. Send a few fake audio chunks
        for i in range(4):
            chunk = bytes([i % 256] * 500)
            await ws.send(chunk)
            print(f"-> Sent audio chunk {i+1} ({len(chunk)} bytes)")
            await asyncio.sleep(0.25)

        # 3. Send stop control frame
        await ws.send(json.dumps({"type": "stop"}))
        print("-> Sent STOP")

        # 4. Collect all response messages
        messages = []
        try:
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
                data = json.loads(msg)
                messages.append(data)
                print(f"<- [{data['type']}] {data['text'][:60]}")

                if data["type"] in ("response_final", "error"):
                    break
        except asyncio.TimeoutError:
            print("[TIMEOUT] Timed out waiting for response_final")
        except websockets.exceptions.ConnectionClosed:
            print("Connection closed by server")

    # Validate
    types_seen = {m["type"] for m in messages}
    assert "transcript_final" in types_seen, "Missing transcript_final"
    assert "response_final" in types_seen, "Missing response_final"
    print(f"\n[PASS] WebSocket test PASSED ({len(messages)} messages received)")


asyncio.run(test_ws())

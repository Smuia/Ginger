"""Quick smoke test for the POST /audio endpoint."""
import json
from http.client import HTTPConnection

boundary = "----TestBoundary123"
file_content = b"fake_audio_data_for_testing" * 5  # ~130 bytes

body = (
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="file"; filename="test.webm"\r\n'
    f"Content-Type: audio/webm\r\n"
    f"\r\n"
).encode() + file_content + f"\r\n--{boundary}--\r\n".encode()

conn = HTTPConnection("localhost", 8000)
conn.request(
    "POST",
    "/audio",
    body,
    {"Content-Type": f"multipart/form-data; boundary={boundary}"},
)
resp = conn.getresponse()
data = json.loads(resp.read())
print(f"Status: {resp.status}")
print(f"Response: {json.dumps(data, indent=2)}")

assert resp.status == 200, f"Expected 200, got {resp.status}"
assert "transcript" in data, "Missing 'transcript' key"
assert "response" in data, "Missing 'response' key"
print("\n[PASS] POST /audio test PASSED")

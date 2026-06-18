import os
import httpx
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

headers = {
    "Authorization": f"Bearer {api_key}"
}
r = httpx.get("https://api.openai.com/v1/models", headers=headers)
data = r.json()
if "data" in data:
    models = [m["id"] for m in data["data"] if "realtime" in m["id"] or "gpt" in m["id"]]
    print("Available relevant models:", sorted(models))
else:
    print("Error:", data)

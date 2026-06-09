import httpx
import asyncio
import chromadb

async def check_connectivity():
    print("Checking Ollama connectivity...")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("http://localhost:11434/api/tags")
            if resp.status_code == 200:
                print("[OK] Ollama is running.")
                models = [m['name'] for m in resp.json().get('models', [])]
                print(f"   Available models: {models}")
            else:
                print(f"[FAIL] Ollama returned status {resp.status_code}")
    except Exception as e:
        print(f"[ERROR] Could not reach Ollama: {e}")

    print("\nChecking ChromaDB connectivity...")
    try:
        client = chromadb.HttpClient(host="localhost", port=8000)
        version = client.get_version()
        print(f"[OK] ChromaDB is running (version {version}).")
    except Exception as e:
        print(f"[ERROR] Could not reach ChromaDB: {e}")

if __name__ == "__main__":
    asyncio.run(check_connectivity())

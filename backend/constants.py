from dotenv import load_dotenv
import os
load_dotenv()

SERVER_URL = 'localhost'
PORT = '8900'
ENV = 'dev'

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
print(f"[InkSolve] API Key loaded: {GEMINI_API_KEY[:10]}...{GEMINI_API_KEY[-4:]}" if GEMINI_API_KEY else "[InkSolve] WARNING: No GEMINI_API_KEY found!")
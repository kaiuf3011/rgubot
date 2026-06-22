# Raise Smart (R-Smart) Assistant 🚀

An intelligent, context-aware chatbot and RAG (Retrieval-Augmented Generation) system built for **Raise Smart (R-Smart)**—an industry-integrated academic program. The assistant provides accurate, real-time answers regarding admissions, RSTNAT exams, placement records, academic courses, hostel facilities, and campus life, strictly adhering to the curated local knowledge base.

---

## 🏗️ Project Architecture

The project is structured as:
- **`backend-node/`**: A Node.js service implementing a **custom in-memory Vector Store** with cosine similarity matching and LangChain/Ollama for embeddings and text generation. It now boots directly into an interactive terminal-based chat client.

---

## 🛠️ Prerequisites

The chatbot relies on **Ollama** running locally to generate embeddings and LLM responses.

1. **Install Ollama**: Download and install it from [ollama.com](https://ollama.com).
2. **Start Ollama service**: Ensure the service is running locally.
3. **Pull the Required Models**:
   ```bash
   # Pull embedding model
   ollama pull nomic-embed-text

   # Pull LLM model
   ollama pull llama3
   ```

---

## 🚀 Getting Started

### Start the Chatbot in the Terminal

You can run and interact with the chatbot directly via the command line:

1. Navigate to the backend directory:
   ```bash
   cd backend-node
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the interactive chat interface:
   ```bash
   npm start
   ```

*The application will load the local knowledge files, build the vector index, and start a prompt where you can chat in real time.*

---

## 📂 Knowledge Base Structure

The Chatbot's source files reside in the `data/` directories of the respective backends:
- **`knowledge.json`**: Categorized details regarding various courses, placements, eligibility criteria, and fee structures.
- **`raise_smart_intents.json`**: Intent patterns and pre-approved responses for core queries.

---

## 🔒 Safety and Guardrails

The RAG pipeline enforces strict response boundaries:
- **Context Lock-Down**: Only responses grounded in the local context are returned.
- **Brand Identity**: Focuses entirely on the Raise Smart / R-Smart program.
- **Synonym Expansion**: Enhances queries matching keywords like *scholarship*, *course*, *placement*, or *hostel* to improve similarity retrieval.
- **Automatic Rejection**: Refers off-topic queries to contact Raise Smart admissions via phone (`+91 84484 48909`) or email (`admission@r-smart.in`).

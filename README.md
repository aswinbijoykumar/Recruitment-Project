# HR Automation Platform

This is a full-stack web application designed to help HR professionals and Technical Recruiters automatically generate professional, well-structured Job Descriptions (JDs) based on client demands. 

The application utilizes **FastAPI** for the backend, and leverages the **Groq Cloud API** (running Llama 3.1) to generate the job descriptions and stream the responses in real-time to a modern frontend interface.

## Features
- **FastAPI Backend**: A lightweight, fast backend for serving the HTML interface and handling API requests.
- **Real-time Streaming**: Streams text tokens directly from Groq Cloud to provide instant feedback as the AI generates the JD.
- **AI-Powered**: Uses Llama-3.1-8b-instant to extrapolate JDs from simple client demands, structuring them into Job Title, Role Overview, Responsibilities, Skills & Qualifications, and Experience.
- **Frontend Dashboard**: Includes a clean frontend (HTML, CSS, JS) served directly by FastAPI.

## Prerequisites
- Python 3.8+
- Groq Cloud API Key

## Setup & Installation

1. **Clone the repository or navigate to the project directory**:
   ```bash
   cd Recruitment-Project
   ```

2. **Create a virtual environment (optional but recommended)**:
   ```bash
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS/Linux
   source .venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**:
   Create a `.env` file in the root directory and add your Groq API key:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ```

## Running the Application

1. **Start the development server**:
   ```bash
   python main.py
   ```
   Alternatively, you can run uvicorn directly:
   ```bash
   uvicorn main:app --reload
   ```

2. **Access the application**:
   Open your browser and navigate to [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Project Structure
- `main.py`: The FastAPI application, API routes, and Groq API integration.
- `requirements.txt`: Python dependencies.
- `templates/`: Directory containing the frontend assets.
  - `index.html`: The main dashboard UI.
  - `style.css`: Stylesheet for the dashboard.
  - `script.js`: Frontend logic for calling the streaming API.
- `.env`: Environment variables (do not commit this file).

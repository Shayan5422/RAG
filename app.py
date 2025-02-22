from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request
import os
import shutil
from pathlib import Path
import tempfile
from extract_text import extract_text_from_pdf
from embeding import (
    split_text,
    create_documents,
    create_embeddings,
    store_embeddings,
    load_local_llm,
    create_qa_chain
)
from langchain.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize embeddings
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

# Create the FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],  # Angular dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create templates directory if it doesn't exist
templates_dir = Path("templates")
templates_dir.mkdir(exist_ok=True)

# Mount templates directory
templates = Jinja2Templates(directory="templates")

# Create uploads directory if it doesn't exist
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # Create a unique filename
        file_path = UPLOAD_DIR / file.filename
        
        # Save the file
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Extract text from the uploaded file
        text = extract_text_from_pdf(str(file_path))
        if not text:
            raise HTTPException(status_code=500, detail="Failed to extract text from the file")

        # Split text into chunks
        chunks = split_text(text)
        if not chunks:
            raise HTTPException(status_code=500, detail="Failed to split text into chunks")

        # Create documents
        documents = create_documents(chunks, source=file.filename)
        if not documents:
            raise HTTPException(status_code=500, detail="Failed to create document objects")

        # Create embeddings
        embedding_model = create_embeddings(documents)
        if not embedding_model:
            raise HTTPException(status_code=500, detail="Failed to create embeddings")

        # Store embeddings in FAISS
        vectorstore = store_embeddings(documents, embedding_model)
        if not vectorstore:
            raise HTTPException(status_code=500, detail="Failed to store embeddings")

        return {
            "filename": file.filename,
            "status": "success",
            "message": "File uploaded and processed successfully"
        }
    except Exception as e:
        logger.error(f"Error in upload endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        file.file.close()

@app.get("/documents")
async def get_documents():
    try:
        # Get list of files in uploads directory
        files = [f.name for f in UPLOAD_DIR.iterdir() if f.is_file()]
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ask")
async def ask_question(
    file: UploadFile = File(...),
    question: str = Form(...)
):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    if not question:
        raise HTTPException(status_code=400, detail="No question provided")
    
    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = temp_file.name
        
        # Extract text from PDF
        text = extract_text_from_pdf(temp_path)
        
        # Split text into chunks
        chunks = split_text(text)
        if not chunks:
            raise HTTPException(status_code=500, detail="Failed to process PDF text")
        
        # Create documents
        documents = create_documents(chunks, source=file.filename)
        if not documents:
            raise HTTPException(status_code=500, detail="Failed to create documents")
        
        # Create embeddings
        embedding_model = create_embeddings(documents)
        if not embedding_model:
            raise HTTPException(status_code=500, detail="Failed to create embeddings")
        
        # Store embeddings
        vectorstore = store_embeddings(documents, embedding_model)
        if not vectorstore:
            raise HTTPException(status_code=500, detail="Failed to store embeddings")
        
        # Load LLM
        llm = load_local_llm()
        if not llm:
            raise HTTPException(status_code=500, detail="Failed to load language model")
        
        # Create QA chain
        qa_chain = create_qa_chain(llm, vectorstore)
        if not qa_chain:
            raise HTTPException(status_code=500, detail="Failed to create QA chain")
        
        # Get answer
        chat_history = []
        response = qa_chain({"question": question, "chat_history": chat_history})
        answer = response.get("answer", "Sorry, I couldn't find an answer to your question.")
        
        # Clean up temporary file
        os.unlink(temp_path)
        
        return {"answer": answer}
        
    except Exception as e:
        # Clean up temporary file if it exists
        if 'temp_path' in locals():
            os.unlink(temp_path)
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        file.file.close()

@app.post("/chat")
async def chat(message: dict):
    try:
        # Get the message from the request body
        user_message = message.get("message")
        if not user_message:
            raise HTTPException(status_code=400, detail="No message provided")
        
        # Load the local LLM
        llm = load_local_llm()
        if not llm:
            raise HTTPException(status_code=500, detail="Failed to load language model")
        
        try:
            # Load stored embeddings with allow_dangerous_deserialization
            vectorstore = FAISS.load_local(
                "faiss_index",
                embeddings,
                allow_dangerous_deserialization=True
            )
            if not vectorstore:
                raise HTTPException(status_code=500, detail="No documents found. Please upload documents first.")
        except Exception as e:
            logger.error(f"Failed to load FAISS index: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to load document store. Please upload documents first.")
        
        # Create QA chain
        qa_chain = create_qa_chain(llm, vectorstore)
        if not qa_chain:
            raise HTTPException(status_code=500, detail="Failed to create QA chain")
        
        # Get answer using RAG
        chat_history = []  # TODO: Implement chat history persistence
        response = qa_chain({"question": user_message, "chat_history": chat_history})
        
        return {
            "answer": response["answer"],
            "sources": response.get("sources", [])
        }
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 
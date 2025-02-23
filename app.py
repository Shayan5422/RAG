from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Depends, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Request
import os
import shutil
from pathlib import Path
import tempfile
from datetime import timedelta, datetime
from sqlalchemy.orm import Session
from typing import List, Optional
import requests
import base64
import json
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
import asyncio
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get environment variables
API_HOST = os.getenv('API_HOST', '0.0.0.0')
API_PORT = int(os.getenv('API_PORT', '8000'))
CORS_ORIGINS = json.loads(os.getenv('CORS_ORIGINS', '["http://localhost:4200"]'))

from extract_text import extract_text_from_pdf
from embeding import (
    split_text,
    create_documents,
    create_embeddings,
    store_embeddings,
    load_local_llm,
    create_qa_chain
)
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
import logging
from models import User, Chat, Project, Document, UserText, TextProjectAssociation, ProjectShare, TextShare, Folder
from schemas import ShareRequest, UserResponse, ProjectResponse, TextResponse, FolderResponse
from auth import (
    get_db,
    get_current_user,
    authenticate_user,
    create_access_token,
    get_password_hash,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize embeddings
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

# Dictionary to store background tasks
background_tasks = {}

# Create the FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
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

# Create audio uploads directory if it doesn't exist
AUDIO_UPLOAD_DIR = Path("audio_uploads")
AUDIO_UPLOAD_DIR.mkdir(exist_ok=True)

# Custom StaticFiles class to add CORS headers
class CustomStaticFiles(StaticFiles):
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            response_started = False

            async def wrapped_send(message):
                nonlocal response_started
                if message["type"] == "http.response.start":
                    response_started = True
                    headers = list(message.get("headers", []))
                    headers.extend([
                        (b"Access-Control-Allow-Origin", b"*"),
                        (b"Access-Control-Allow-Methods", b"GET, OPTIONS"),
                        (b"Access-Control-Allow-Headers", b"*"),
                        (b"Content-Type", b"application/pdf"),
                        (b"Content-Disposition", b"inline"),
                    ])
                    message["headers"] = headers
                await send(message)

            await super().__call__(scope, receive, wrapped_send)
        else:
            await super().__call__(scope, receive, send)

# Mount the uploads directory with custom static files handler
app.mount("/uploads", CustomStaticFiles(directory="uploads"), name="uploads")

# Authentication endpoints
@app.post("/register")
async def register(
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    # Check if username already exists
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Check if email already exists
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(password)
    user = User(username=username, email=email, hashed_password=hashed_password)
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return {"message": "User created successfully"}

@app.post("/token")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# Protected endpoints
@app.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    return {
        "username": current_user.username,
        "email": current_user.email
    }

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
async def chat(
    message: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        user_message = message.get("message")
        if not user_message:
            raise HTTPException(status_code=400, detail="No message provided")
        
        llm = load_local_llm()
        if not llm:
            raise HTTPException(status_code=500, detail="Failed to load language model")
        
        try:
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
        
        qa_chain = create_qa_chain(llm, vectorstore)
        if not qa_chain:
            raise HTTPException(status_code=500, detail="Failed to create QA chain")
        
        # Get chat history for the user
        chat_history = [(chat.question, chat.answer) for chat in current_user.chats]
        
        # Get answer using RAG
        response = qa_chain({"question": user_message, "chat_history": chat_history})
        
        # Store the chat in the database
        chat = Chat(
            user_id=current_user.id,
            question=user_message,
            answer=response["answer"],
            document_name="Current Session"
        )
        db.add(chat)
        db.commit()
        
        return {
            "answer": response["answer"],
            "sources": response.get("sources", [])
        }
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chat-history")
async def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chats = db.query(Chat).filter(Chat.user_id == current_user.id).order_by(Chat.created_at.desc()).all()
    return [{
        "id": chat.id,
        "question": chat.question,
        "answer": chat.answer,
        "document_name": chat.document_name,
        "created_at": chat.created_at
    } for chat in chats]

# Project Management Routes
@app.post("/projects")
async def create_project(
    name: str = Form(...),
    description: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    project = Project(
        name=name,
        description=description,
        user_id=current_user.id
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@app.get("/projects")
async def get_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Get owned projects
    owned_projects = db.query(Project).filter(Project.user_id == current_user.id).all()
    
    # Get shared projects
    shared_projects = db.query(Project).join(ProjectShare).filter(
        ProjectShare.user_id == current_user.id
    ).all()
    
    # Add owner information to each project
    for project in owned_projects:
        project.owner = db.query(User).filter(User.id == project.user_id).first()
        project.is_shared = False  # Mark as not shared since user is the owner
    for project in shared_projects:
        project.owner = db.query(User).filter(User.id == project.user_id).first()
        project.is_shared = True  # Mark as shared since current user is not the owner
    
    return owned_projects + shared_projects

@app.get("/projects/{project_id}")
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.post("/projects/{project_id}/documents")
async def upload_project_document(
    project_id: int,
    file: UploadFile = File(...),
    folder_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check project access
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (
            (Project.user_id == current_user.id) |
            Project.id.in_(
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    # If folder_id is provided, verify it exists
    if folder_id:
        folder = db.query(Folder).filter(
            Folder.id == folder_id,
            Folder.project_id == project_id
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")

    try:
        # Create project directory if it doesn't exist
        project_dir = UPLOAD_DIR / str(project_id)
        project_dir.mkdir(exist_ok=True)

        # If folder is specified, create nested folder structure
        if folder_id:
            folder_path = project_dir / str(folder_id)
            folder_path.mkdir(exist_ok=True)
            file_path = folder_path / file.filename
            relative_path = f"/uploads/{project_id}/{folder_id}/{file.filename}"
        else:
            file_path = project_dir / file.filename
            relative_path = f"/uploads/{project_id}/{file.filename}"

        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Extract text from the uploaded file
        text = extract_text_from_pdf(str(file_path))
        if not text:
            raise HTTPException(status_code=500, detail="Failed to extract text from the file")

        # Create document record
        document = Document(
            name=file.filename,
            content=text,
            file_path=relative_path,
            project_id=project_id,
            folder_id=folder_id
        )
        db.add(document)
        db.commit()
        db.refresh(document)

        # Process document for embeddings
        chunks = split_text(text)
        documents = create_documents(chunks, source=file.filename)
        embedding_model = create_embeddings(documents)
        vectorstore = store_embeddings(documents, embedding_model)

        return {
            "message": "Document uploaded successfully",
            "document_id": document.id,
            "file_path": relative_path
        }
    except Exception as e:
        logger.error(f"Error uploading document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        file.file.close()

@app.get("/projects/{project_id}/documents")
async def get_project_documents(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user owns or has shared access to the project
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (
            (Project.user_id == current_user.id) |  # User is owner
            Project.id.in_(  # User has shared access
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    documents = db.query(Document).filter(Document.project_id == project_id).all()
    return documents

@app.delete("/projects/{project_id}/documents/{document_id}")
async def delete_project_document(
    project_id: int,
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user owns or has shared access to the project
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (
            (Project.user_id == current_user.id) |  # User is owner
            Project.id.in_(  # User has shared access
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    # Get the document
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        # Delete the actual file
        file_path = Path(document.file_path.lstrip('/'))
        if file_path.exists():
            file_path.unlink()

        # Delete from database
        db.delete(document)
        db.commit()
        
        return {"message": "Document deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# Update the ask endpoint to support project context
@app.post("/projects/{project_id}/ask")
async def ask_project_question(
    project_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user owns or has shared access to the project
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (
            (Project.user_id == current_user.id) |  # User is owner
            Project.id.in_(  # User has shared access
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    try:
        # Get request body
        body = await request.json()
        question = body.get('question')
        context_type = body.get('context_type', 'project')  # Default to project context

        if not question:
            raise HTTPException(status_code=400, detail="Question is required")

        # Get all documents and texts in the project
        documents = db.query(Document).filter(
            Document.project_id == project_id,
            Document.folder_id == None  # Only root level documents for project context
        ).all()

        texts = db.query(UserText).join(TextProjectAssociation).filter(
            TextProjectAssociation.project_id == project_id,
            UserText.folder_id == None  # Only root level texts for project context
        ).all()

        # Combine texts from documents and texts
        all_texts = []
        
        # Add document contents
        for doc in documents:
            if doc.content and len(doc.content.strip()) > 0:
                chunks = split_text(doc.content)
                if chunks:
                    all_texts.extend(chunks)

        # Add text contents
        for text in texts:
            if text.content and len(text.content.strip()) > 0:
                chunks = split_text(text.content)
                if chunks:
                    all_texts.extend(chunks)

        if not all_texts:
            raise HTTPException(status_code=400, detail="No valid content found in project")

        # Create documents for embedding
        doc_objects = create_documents(all_texts)
        if not doc_objects:
            raise HTTPException(status_code=400, detail="Failed to create document objects from content")

        embedding_model = create_embeddings(doc_objects)
        if not embedding_model:
            raise HTTPException(status_code=500, detail="Failed to initialize embedding model")

        vectorstore = store_embeddings(doc_objects, embedding_model)
        if not vectorstore:
            raise HTTPException(status_code=500, detail="Failed to create vector store")
        
        # Load LLM and create QA chain
        llm = load_local_llm()
        if not llm:
            raise HTTPException(status_code=500, detail="Failed to initialize language model")

        qa_chain = create_qa_chain(llm, vectorstore)
        if not qa_chain:
            raise HTTPException(status_code=500, detail="Failed to create QA chain")
        
        # Get answer
        chat_history = []
        response = qa_chain({"question": question, "chat_history": chat_history})
        answer = response.get("answer", "Sorry, I couldn't find an answer to your question.")

        # Save chat history
        source_names = []
        if documents:
            source_names.extend(doc.name for doc in documents)
        if texts:
            source_names.extend(text.title for text in texts)

        chat = Chat(
            user_id=current_user.id,
            project_id=project_id,
            question=question,
            answer=answer,
            document_name=", ".join(source_names)
        )
        db.add(chat)
        db.commit()
        
        return {"answer": answer}
        
    except Exception as e:
        logger.error(f"Error in project question endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# User Text Management Routes
@app.post("/texts")
async def create_text(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    body = await request.json()
    title = body.get('title')
    content = body.get('content')
    project_ids = body.get('project_ids', [])
    folder_id = body.get('folder_id')  # Optional folder ID

    if not title or not content:
        raise HTTPException(status_code=400, detail="Title and content are required")

    # If folder_id is provided, verify it exists and belongs to one of the projects
    if folder_id:
        folder = db.query(Folder).filter(
            Folder.id == folder_id,
            Folder.project_id.in_(project_ids)
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found or doesn't belong to specified projects")

    text = UserText(
        title=title,
        content=content,
        user_id=current_user.id,
        folder_id=folder_id
    )
    db.add(text)
    db.commit()
    db.refresh(text)

    # Associate with projects
    if project_ids:
        for project_id in project_ids:
            association = TextProjectAssociation(
                text_id=text.id,
                project_id=project_id
            )
            db.add(association)
        db.commit()

    return text

@app.get("/texts")
async def get_texts(
    project_id: int = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if project_id:
        # Check if user has access to the project
        project_access = db.query(Project).filter(
            (Project.id == project_id) &
            (
                (Project.user_id == current_user.id) |  # User is owner
                Project.id.in_(  # User has shared access
                    db.query(ProjectShare.project_id)
                    .filter(ProjectShare.user_id == current_user.id)
                )
            )
        ).first()
        
        if not project_access:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
            
        # Get texts associated with the project
        texts = db.query(UserText).join(TextProjectAssociation).filter(
            TextProjectAssociation.project_id == project_id
        ).all()
        
        # Add owner information to each text
        for text in texts:
            text.owner = db.query(User).filter(User.id == text.user_id).first()
            text.is_shared = (text.user_id != current_user.id)
        
        return texts
    else:
        # Get all texts user has access to
        texts = db.query(UserText).filter(
            (
                (UserText.user_id == current_user.id) |  # Owned texts
                UserText.id.in_(  # Directly shared texts
                    db.query(TextShare.text_id)
                    .filter(TextShare.user_id == current_user.id)
                ) |
                UserText.id.in_(  # Texts from shared projects
                    db.query(TextProjectAssociation.text_id)
                    .join(Project, TextProjectAssociation.project_id == Project.id)
                    .join(ProjectShare, ProjectShare.project_id == Project.id)
                    .filter(ProjectShare.user_id == current_user.id)
                )
            )
        ).all()
        
        # Add owner information to each text
        for text in texts:
            text.owner = db.query(User).filter(User.id == text.user_id).first()
            text.is_shared = (text.user_id != current_user.id)
        
        return texts

@app.get("/texts/{text_id}")
async def get_text(
    text_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user owns the text or has shared access
    text = db.query(UserText).filter(
        (UserText.id == text_id) &
        (
            (UserText.user_id == current_user.id) |  # User is owner
            UserText.id.in_(  # User has direct shared access
                db.query(TextShare.text_id).filter(TextShare.user_id == current_user.id)
            ) |
            UserText.id.in_(  # Text is in a shared project
                db.query(TextProjectAssociation.text_id)
                .join(Project, TextProjectAssociation.project_id == Project.id)
                .join(ProjectShare, ProjectShare.project_id == Project.id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not text:
        raise HTTPException(status_code=404, detail="Text not found or access denied")
    text.owner = db.query(User).filter(User.id == text.user_id).first()
    text.is_shared = (text.user_id != current_user.id)
    return text

@app.put("/texts/{text_id}")
async def update_text(
    text_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user owns the text or has shared access
    text = db.query(UserText).filter(
        (UserText.id == text_id) &
        (
            (UserText.user_id == current_user.id) |  # User is owner
            UserText.id.in_(  # User has direct shared access
                db.query(TextShare.text_id).filter(TextShare.user_id == current_user.id)
            ) |
            UserText.id.in_(  # Text is in a shared project
                db.query(TextProjectAssociation.text_id)
                .join(Project, TextProjectAssociation.project_id == Project.id)
                .join(ProjectShare, ProjectShare.project_id == Project.id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not text:
        raise HTTPException(status_code=404, detail="Text not found or access denied")

    body = await request.json()
    title = body.get('title')
    content = body.get('content')
    project_ids = body.get('project_ids')

    if title:
        text.title = title
    if content:
        text.content = content
    
    # Update project associations if specified
    if project_ids is not None:
        # Verify user has access to all specified projects
        for project_id in project_ids:
            project_access = db.query(Project).filter(
                (Project.id == project_id) &
                (
                    (Project.user_id == current_user.id) |  # User is owner
                    Project.id.in_(  # User has shared access
                        db.query(ProjectShare.project_id)
                        .filter(ProjectShare.user_id == current_user.id)
                    )
                )
            ).first()
            if not project_access:
                raise HTTPException(status_code=404, detail=f"Project {project_id} not found or access denied")
        
        # Remove existing associations
        db.query(TextProjectAssociation).filter(
            TextProjectAssociation.text_id == text_id
        ).delete()
        
        # Add new associations
        for project_id in project_ids:
            association = TextProjectAssociation(
                text_id=text_id,
                project_id=project_id
            )
            db.add(association)

    db.commit()
    db.refresh(text)
    return text

@app.delete("/texts/{text_id}")
async def delete_text(
    text_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only owner can delete the text
    text = db.query(UserText).filter(
        UserText.id == text_id,
        UserText.user_id == current_user.id  # Must be owner to delete
    ).first()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found or you don't have permission to delete")

    # Remove project associations
    db.query(TextProjectAssociation).filter(
        TextProjectAssociation.text_id == text_id
    ).delete()

    # Remove shares
    db.query(TextShare).filter(
        TextShare.text_id == text_id
    ).delete()

    db.delete(text)
    db.commit()
    return {"message": "Text deleted successfully"}

# Project Sharing Endpoints
@app.post("/projects/{project_id}/share")
async def share_project(
    project_id: int,
    share_request: ShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify project exists and belongs to user
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Find user to share with
    share_with_user = db.query(User).filter(User.email == share_request.email).first()
    if not share_with_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already shared
    existing_share = db.query(ProjectShare).filter(
        ProjectShare.project_id == project_id,
        ProjectShare.user_id == share_with_user.id
    ).first()
    if existing_share:
        raise HTTPException(status_code=400, detail="Project already shared with this user")
    
    # Create share
    share = ProjectShare(project_id=project_id, user_id=share_with_user.id)
    db.add(share)
    db.commit()
    
    return {"message": "Project shared successfully"}

@app.delete("/projects/{project_id}/share/{user_id}")
async def remove_project_access(
    project_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify project exists and belongs to user
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Remove share
    share = db.query(ProjectShare).filter(
        ProjectShare.project_id == project_id,
        ProjectShare.user_id == user_id
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    db.delete(share)
    db.commit()
    
    return {"message": "Access removed successfully"}

@app.get("/projects/{project_id}/shared-users", response_model=List[UserResponse])
async def get_project_shared_users(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user owns or has shared access to the project
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (
            (Project.user_id == current_user.id) |  # User is owner
            Project.id.in_(  # User has shared access
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")
    
    # Get shared users
    shared_users = db.query(User).join(ProjectShare).filter(
        ProjectShare.project_id == project_id
    ).all()
    
    return shared_users

# Text Sharing Endpoints
@app.post("/texts/{text_id}/share")
async def share_text(
    text_id: int,
    share_request: ShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user owns the text or has shared access
    text = db.query(UserText).filter(
        (UserText.id == text_id) &
        (
            (UserText.user_id == current_user.id) |  # User is owner
            UserText.id.in_(  # User has direct shared access
                db.query(TextShare.text_id).filter(TextShare.user_id == current_user.id)
            ) |
            UserText.id.in_(  # Text is in a shared project
                db.query(TextProjectAssociation.text_id)
                .join(Project, TextProjectAssociation.project_id == Project.id)
                .join(ProjectShare, ProjectShare.project_id == Project.id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not text:
        raise HTTPException(status_code=404, detail="Text not found or access denied")
    
    # Find user to share with
    share_with_user = db.query(User).filter(User.email == share_request.email).first()
    if not share_with_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already shared
    existing_share = db.query(TextShare).filter(
        TextShare.text_id == text_id,
        TextShare.user_id == share_with_user.id
    ).first()
    if existing_share:
        raise HTTPException(status_code=400, detail="Text already shared with this user")
    
    # Check if text is associated with any projects
    text_projects = db.query(TextProjectAssociation).filter(
        TextProjectAssociation.text_id == text_id
    ).all()
    
    if not text_projects:
        # Create a temporary project for standalone text
        temp_project = Project(
            name=f"Shared: {text.title}",
            description="Temporary project for shared text",
            user_id=current_user.id
        )
        db.add(temp_project)
        db.commit()
        db.refresh(temp_project)
        
        # Associate text with temporary project
        text_project = TextProjectAssociation(
            text_id=text_id,
            project_id=temp_project.id
        )
        db.add(text_project)
        
        # Share the temporary project with the user
        project_share = ProjectShare(
            project_id=temp_project.id,
            user_id=share_with_user.id
        )
        db.add(project_share)
        db.commit()
    else:
        # Share existing projects with the user
        for text_project in text_projects:
            existing_project_share = db.query(ProjectShare).filter(
                ProjectShare.project_id == text_project.project_id,
                ProjectShare.user_id == share_with_user.id
            ).first()
            
            if not existing_project_share:
                project_share = ProjectShare(
                    project_id=text_project.project_id,
                    user_id=share_with_user.id
                )
                db.add(project_share)
    
    # Create text share
    share = TextShare(text_id=text_id, user_id=share_with_user.id)
    db.add(share)
    db.commit()
    
    return {"message": "Text shared successfully"}

@app.delete("/texts/{text_id}/share/{user_id}")
async def remove_text_access(
    text_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify text exists and belongs to user
    text = db.query(UserText).filter(
        UserText.id == text_id,
        UserText.user_id == current_user.id
    ).first()
    if not text:
        raise HTTPException(status_code=404, detail="Text not found")
    
    # Remove share
    share = db.query(TextShare).filter(
        TextShare.text_id == text_id,
        TextShare.user_id == user_id
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    
    db.delete(share)
    db.commit()
    
    return {"message": "Access removed successfully"}

@app.get("/texts/{text_id}/shared-users", response_model=List[UserResponse])
async def get_text_shared_users(
    text_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user owns the text or has shared access
    text = db.query(UserText).filter(
        (UserText.id == text_id) &
        (
            (UserText.user_id == current_user.id) |  # User is owner
            UserText.id.in_(  # User has direct shared access
                db.query(TextShare.text_id).filter(TextShare.user_id == current_user.id)
            ) |
            UserText.id.in_(  # Text is in a shared project
                db.query(TextProjectAssociation.text_id)
                .join(Project, TextProjectAssociation.project_id == Project.id)
                .join(ProjectShare, ProjectShare.project_id == Project.id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not text:
        raise HTTPException(status_code=404, detail="Text not found or access denied")
    
    # Get shared users
    shared_users = db.query(User).join(TextShare).filter(
        TextShare.text_id == text_id
    ).all()
    
    return shared_users

# Audio transcription endpoint
@app.post("/transcribe-audio")
async def transcribe_audio(
    file: UploadFile = File(...),
    text_id: int = Form(None),  # Make text_id optional
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # If text_id is provided, verify access
        if text_id is not None:
            text = db.query(UserText).filter(
                (UserText.id == text_id) &
                (
                    (UserText.user_id == current_user.id) |  # User is owner
                    UserText.id.in_(  # User has direct shared access
                        db.query(TextShare.text_id).filter(TextShare.user_id == current_user.id)
                    ) |
                    UserText.id.in_(  # Text is in a shared project
                        db.query(TextProjectAssociation.text_id)
                        .join(Project, TextProjectAssociation.project_id == Project.id)
                        .join(ProjectShare, ProjectShare.project_id == Project.id)
                        .filter(ProjectShare.user_id == current_user.id)
                    )
                )
            ).first()
            
            if not text:
                raise HTTPException(status_code=404, detail="Text not found or access denied")

        # Create a unique filename with timestamp
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"recording_{timestamp}.wav"
        file_path = AUDIO_UPLOAD_DIR / filename
        
        # Save the file
        try:
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            logger.error(f"Error saving audio file: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to save audio file")

        # Read the file as binary
        try:
            with open(file_path, "rb") as audio_file:
                audio_content = audio_file.read()
        except Exception as e:
            logger.error(f"Error reading audio file: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to read audio file")

        # Send to external transcription service
        try:
            # First get the token
            auth_response = requests.post(
                'http://backend.shaz.ai/token/',
                data={
                    'username': 'admin',
                    'password': '1234'
                }
            )
            
            if auth_response.status_code != 200:
                logger.error(f"Authentication error: {auth_response.text}")
                raise HTTPException(
                    status_code=auth_response.status_code,
                    detail=f"Authentication failed: {auth_response.text}"
                )
            
            token = auth_response.json().get('access_token')
            if not token:
                raise HTTPException(
                    status_code=500,
                    detail="No token received from authentication service"
                )

            headers = {
                'Authorization': f'Bearer {token}'
            }
            
            session_id = f"session_{timestamp}"
            
            files = {
                'file': ('chunk.wav', audio_content, 'audio/wav')
            }
            data = {
                'chunk_number': '1',
                'session_id': session_id,
                'model': 'openai/whisper-large-v3-turbo'
            }

            response = requests.post(
                'http://backend.shaz.ai/process-chunk/',
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )

            logger.info(f"Transcription service response status: {response.status_code}")
            logger.info(f"Transcription service response headers: {response.headers}")
            try:
                logger.info(f"Transcription service response body: {response.json()}")
            except:
                logger.info(f"Transcription service raw response: {response.text}")

            if response.status_code != 200:
                error_detail = "Unknown error"
                try:
                    error_response = response.json()
                    if isinstance(error_response, dict):
                        error_detail = error_response.get('detail', error_response)
                except:
                    error_detail = response.text or "No error details available"
                
                logger.error(f"Transcription service error: {error_detail}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Transcription service error: {error_detail}"
                )

            try:
                result = response.json()
            except Exception as e:
                logger.error(f"Failed to parse JSON response: {str(e)}")
                logger.error(f"Raw response: {response.text}")
                raise HTTPException(
                    status_code=500,
                    detail="Invalid JSON response from transcription service"
                )

            transcription = None
            if isinstance(result, dict):
                transcription = (
                    result.get('chunk_transcription') or
                    result.get('transcription') or 
                    result.get('text') or 
                    result.get('result')
                )
            elif isinstance(result, str):
                transcription = result

            if not transcription:
                logger.error(f"No transcription found in response: {result}")
                raise HTTPException(
                    status_code=500,
                    detail="No transcription found in service response"
                )

            logger.info(f"Successfully extracted transcription: {transcription}")

            # If text_id was provided, update the existing text
            if text_id is not None:
                if text.content and not text.content.endswith('\n'):
                    text.content += '\n'
                text.content += transcription
                db.commit()
                db.refresh(text)
                return text
            else:
                # Just return the transcribed text
                return {"content": transcription}

        except requests.RequestException as e:
            logger.error(f"Error calling transcription service: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to connect to transcription service: {str(e)}"
            )

    except Exception as e:
        logger.error(f"Transcription error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}"
        )

    finally:
        # Clean up the audio file
        if 'file_path' in locals() and file_path.exists():
            try:
                file_path.unlink()
            except Exception as e:
                logger.error(f"Error deleting audio file: {str(e)}")
        
        file.file.close()

@app.delete("/projects/{project_id}")
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Log the deletion attempt
    logger.info(f"Attempting to delete project {project_id} by user {current_user.id}")

    # First check if project exists at all
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        logger.error(f"Project {project_id} not found")
        raise HTTPException(status_code=404, detail="Project not found")

    # Then check if user is the owner
    if project.user_id != current_user.id:
        logger.error(f"User {current_user.id} is not the owner of project {project_id}")
        raise HTTPException(status_code=403, detail="You don't have permission to delete this project")

    try:
        # Log the deletion process
        logger.info(f"Starting deletion process for project {project_id}")

        # Delete all document files
        for document in project.documents:
            if document.file_path:
                file_path = Path(document.file_path.lstrip('/'))
                if file_path.exists():
                    file_path.unlink()
                    logger.info(f"Deleted document file: {file_path}")

        # Delete project shares
        shares_deleted = db.query(ProjectShare).filter(
            ProjectShare.project_id == project_id
        ).delete()
        logger.info(f"Deleted {shares_deleted} project shares")

        # Delete text associations
        text_assocs_deleted = db.query(TextProjectAssociation).filter(
            TextProjectAssociation.project_id == project_id
        ).delete()
        logger.info(f"Deleted {text_assocs_deleted} text associations")

        # Delete documents
        docs_deleted = db.query(Document).filter(
            Document.project_id == project_id
        ).delete()
        logger.info(f"Deleted {docs_deleted} documents")

        # Delete chats
        chats_deleted = db.query(Chat).filter(
            Chat.project_id == project_id
        ).delete()
        logger.info(f"Deleted {chats_deleted} chats")

        # Finally delete the project
        db.delete(project)
        db.commit()
        logger.info(f"Successfully deleted project {project_id}")
        
        return {"message": "Project deleted successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/projects/{project_id}")
async def update_project(
    project_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user owns or has shared access to the project
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (
            (Project.user_id == current_user.id) |  # User is owner
            Project.id.in_(  # User has shared access
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    body = await request.json()
    name = body.get('name')
    description = body.get('description')

    if name:
        project.name = name
    if description is not None:  # Allow empty description
        project.description = description

    db.commit()
    db.refresh(project)
    return project

@app.post("/suggest-project")
async def suggest_project(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # Get request body
        body = await request.json()
        title = body.get('title', '')
        content = body.get('content', '')

        if not content:
            raise HTTPException(status_code=400, detail="Content is required")

        # Get all user's projects (both owned and shared)
        owned_projects = db.query(Project).filter(Project.user_id == current_user.id).all()
        shared_projects = db.query(Project).join(ProjectShare).filter(
            ProjectShare.user_id == current_user.id
        ).all()
        all_projects = owned_projects + shared_projects

        # If no existing projects, suggest creating a new one
        if not all_projects:
            return {
                "suggestions": [],
                "new_project": {
                    "name": title[:50] if title else "New Project",
                    "description": content[:200] + "..." if len(content) > 200 else content
                }
            }

        try:
            # Get embedding for new content
            new_content_embedding = embeddings.embed_query(content)

            # Store all project similarities
            project_similarities = []

            for project in all_projects:
                # Get all texts and documents from the project
                project_texts = db.query(UserText).join(TextProjectAssociation).filter(
                    TextProjectAssociation.project_id == project.id
                ).all()
                
                project_docs = db.query(Document).filter(
                    Document.project_id == project.id
                ).all()

                # Combine all content
                project_content = []
                for text in project_texts:
                    if text.content:
                        project_content.append(text.content)
                for doc in project_docs:
                    if doc.content:
                        project_content.append(doc.content)

                if project_content:
                    # Join all content with spaces
                    combined_content = " ".join(project_content)
                    
                    # Get embedding for project content
                    project_embedding = embeddings.embed_query(combined_content)
                    
                    # Calculate cosine similarity
                    similarity = cosine_similarity(
                        np.array(new_content_embedding).reshape(1, -1),
                        np.array(project_embedding).reshape(1, -1)
                    )[0][0]

                    project_similarities.append({
                        "project_id": project.id,
                        "name": project.name,
                        "description": project.description,
                        "similarity": float(similarity)  # Convert numpy float to Python float
                    })

            # Sort projects by similarity and get top 3
            project_similarities.sort(key=lambda x: x["similarity"], reverse=True)
            top_suggestions = project_similarities[:3]

            # Return both suggestions and new project option
            return {
                "suggestions": top_suggestions,
                "new_project": {
                    "name": title[:50] if title else "New Project",
                    "description": content[:200] + "..." if len(content) > 200 else content
                }
            }

        except Exception as e:
            logger.error(f"Error in similarity matching: {str(e)}")
            # Continue with basic suggestion if similarity matching fails

        # If similarity matching failed, return empty suggestions and new project option
        return {
            "suggestions": [],
            "new_project": {
                "name": title[:50] if title else "New Project",
                "description": content[:200] + "..." if len(content) > 200 else content
            }
        }

    except Exception as e:
        logger.error(f"Error in suggest project endpoint: {str(e)}")
        # Return empty suggestions and basic new project suggestion if everything fails
        return {
            "suggestions": [],
            "new_project": {
                "name": "New Project",
                "description": "Project created from text content"
            }
        }

# Folder Management Endpoints
@app.post("/projects/{project_id}/folders")
async def create_folder(
    project_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check project access
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (
            (Project.user_id == current_user.id) |
            Project.id.in_(
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    body = await request.json()
    name = body.get('name')
    parent_folder_id = body.get('parent_folder_id')  # Optional

    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    # If parent_folder_id is provided, verify it exists and user has access
    if parent_folder_id:
        parent_folder = db.query(Folder).filter(
            Folder.id == parent_folder_id,
            Folder.project_id == project_id
        ).first()
        if not parent_folder:
            raise HTTPException(status_code=404, detail="Parent folder not found")

    folder = Folder(
        name=name,
        project_id=project_id,
        parent_folder_id=parent_folder_id
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder

@app.get("/projects/{project_id}/folders")
async def get_folders(
    project_id: int,
    parent_folder_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check project access
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (
            (Project.user_id == current_user.id) |
            Project.id.in_(
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    if parent_folder_id is None:
        folders = db.query(Folder).filter(Folder.project_id == project_id).all()
    else:
        folders = db.query(Folder).filter(
            Folder.project_id == project_id,
            Folder.parent_folder_id == parent_folder_id
        ).all()
    return folders

@app.put("/projects/{project_id}/folders/{folder_id}")
async def update_folder(
    project_id: int,
    folder_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check project and folder access
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.project_id == project_id
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Check project access
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (
            (Project.user_id == current_user.id) |
            Project.id.in_(
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    body = await request.json()
    name = body.get('name')
    new_parent_id = body.get('parent_folder_id')

    if name:
        folder.name = name
    if new_parent_id is not None:
        # Verify new parent folder exists if provided
        if new_parent_id:
            new_parent = db.query(Folder).filter(
                Folder.id == new_parent_id,
                Folder.project_id == project_id
            ).first()
            if not new_parent:
                raise HTTPException(status_code=404, detail="New parent folder not found")
            # Prevent circular reference
            if new_parent_id == folder_id:
                raise HTTPException(status_code=400, detail="Cannot set folder as its own parent")
        folder.parent_folder_id = new_parent_id

    db.commit()
    db.refresh(folder)
    return folder

@app.delete("/projects/{project_id}/folders/{folder_id}")
async def delete_folder(
    project_id: int,
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check project and folder access
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.project_id == project_id
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Check project access
    project = db.query(Project).filter(
        (Project.id == project_id) &
        (Project.user_id == current_user.id)  # Only owner can delete folders
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    try:
        # Delete all nested folders recursively
        def delete_nested_folders(folder_id):
            nested_folders = db.query(Folder).filter(
                Folder.parent_folder_id == folder_id
            ).all()
            for nested_folder in nested_folders:
                delete_nested_folders(nested_folder.id)
                db.delete(nested_folder)

        delete_nested_folders(folder_id)

        # Update documents and texts to remove folder association
        db.query(Document).filter(Document.folder_id == folder_id).update(
            {"folder_id": None}
        )
        db.query(UserText).filter(UserText.folder_id == folder_id).update(
            {"folder_id": None}
        )

        # Delete the folder itself
        db.delete(folder)
        db.commit()
        return {"message": "Folder and all nested folders deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/folders/{folder_id}/ask")
async def ask_folder_question(
    folder_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Get the folder and verify access
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Check project access
    project = db.query(Project).filter(
        (Project.id == folder.project_id) &
        (
            (Project.user_id == current_user.id) |
            Project.id.in_(
                db.query(ProjectShare.project_id)
                .filter(ProjectShare.user_id == current_user.id)
            )
        )
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    try:
        # Get request body
        body = await request.json()
        question = body.get('question')

        if not question:
            raise HTTPException(status_code=400, detail="Question is required")

        # Get all documents and texts in the folder
        documents = db.query(Document).filter(
            Document.folder_id == folder_id
        ).all()

        texts = db.query(UserText).filter(
            UserText.folder_id == folder_id
        ).all()

        # Combine texts from documents and texts
        all_texts = []
        
        # Add document contents
        for doc in documents:
            if doc.content and len(doc.content.strip()) > 0:
                chunks = split_text(doc.content)
                if chunks:
                    all_texts.extend(chunks)

        # Add text contents
        for text in texts:
            if text.content and len(text.content.strip()) > 0:
                chunks = split_text(text.content)
                if chunks:
                    all_texts.extend(chunks)

        if not all_texts:
            raise HTTPException(status_code=400, detail="No valid content found in folder")

        # Create documents for embedding
        doc_objects = create_documents(all_texts)
        if not doc_objects:
            raise HTTPException(status_code=400, detail="Failed to create document objects from content")

        embedding_model = create_embeddings(doc_objects)
        if not embedding_model:
            raise HTTPException(status_code=500, detail="Failed to initialize embedding model")

        vectorstore = store_embeddings(doc_objects, embedding_model)
        if not vectorstore:
            raise HTTPException(status_code=500, detail="Failed to create vector store")
        
        # Load LLM and create QA chain
        llm = load_local_llm()
        if not llm:
            raise HTTPException(status_code=500, detail="Failed to initialize language model")

        qa_chain = create_qa_chain(llm, vectorstore)
        if not qa_chain:
            raise HTTPException(status_code=500, detail="Failed to create QA chain")
        
        # Get answer
        chat_history = []
        response = qa_chain({"question": question, "chat_history": chat_history})
        answer = response.get("answer", "Sorry, I couldn't find an answer to your question.")

        # Save chat history
        source_names = []
        if documents:
            source_names.extend(doc.name for doc in documents)
        if texts:
            source_names.extend(text.title for text in texts)

        chat = Chat(
            user_id=current_user.id,
            project_id=project.id,
            question=question,
            answer=answer,
            document_name=f"Folder: {folder.name} - {', '.join(source_names)}"
        )
        db.add(chat)
        db.commit()
        
        return {"answer": answer}
        
    except Exception as e:
        logger.error(f"Error in folder question endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def generate_summary_pdf(project_name: str, summary: str, file_summaries: list, output_dir: str = "uploads") -> str:
    # Create unique filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"summary_{timestamp}.pdf"
    filepath = os.path.join(output_dir, filename)
    
    # Create PDF document
    doc = SimpleDocTemplate(filepath, pagesize=letter)
    styles = getSampleStyleSheet()
    
    # Create custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        spaceAfter=30
    )
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=20
    )
    content_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=11,
        spaceAfter=15
    )
    
    # Build PDF content
    story = []
    
    # Add title
    story.append(Paragraph(f"Content Summary Report - {project_name}", title_style))
    story.append(Spacer(1, 20))
    
    # Add overall summary
    story.append(Paragraph("Overall Summary", heading_style))
    story.append(Paragraph(summary, content_style))
    story.append(PageBreak())
    
    # Add individual file summaries
    story.append(Paragraph("Individual File Summaries", heading_style))
    for file_summary in file_summaries:
        parts = file_summary.split("\n", 1)
        if len(parts) == 2:
            file_name, content = parts
            story.append(Paragraph(file_name, heading_style))
            story.append(Paragraph(content, content_style))
            story.append(Spacer(1, 20))
    
    # Generate PDF
    doc.build(story)
    return f"/uploads/{filename}"

@app.post("/summarize")
async def summarize_content(request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = await request.json()
    project_id = payload.get("project_id")
    folder_id = payload.get("folder_id")

    if not project_id:
        raise HTTPException(status_code=400, detail="Project id is required")

    # Verify project access (owned or shared)
    project = db.query(Project).filter(
        (Project.id == project_id) &
        ((Project.user_id == current_user.id) |
         Project.id.in_(db.query(ProjectShare.project_id).filter(ProjectShare.user_id == current_user.id)))
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")

    # Create a unique task ID for this summarization
    task_id = f"summarize_{project_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    async def process_files():
        try:
            files = []
            if folder_id:
                documents = db.query(Document).filter(
                    Document.project_id == project_id,
                    Document.folder_id == folder_id
                ).all()
                texts = db.query(UserText).filter(UserText.folder_id == folder_id).all()
            else:
                documents = db.query(Document).filter(Document.project_id == project_id).all()
                texts = db.query(UserText).join(TextProjectAssociation).filter(TextProjectAssociation.project_id == project_id).all()

            for doc in documents:
                if doc.content and doc.content.strip():
                    files.append((doc.name, doc.content.strip()))
            for text in texts:
                if text.content and text.content.strip():
                    file_name = text.title if text.title else "Text"
                    files.append((file_name, text.content.strip()))

            if not files:
                return {"error": "No content found to summarize"}

            llm = load_local_llm()
            if not llm:
                return {"error": "Failed to load language model"}

            file_summaries = []
            for file_name, content in files:
                try:
                    prompt = f"Please provide a comprehensive summary of the following content. Focus on key points and main ideas:\n\n{content}\n\nSummary:"
                    result = llm(prompt)
                    summary_text = result if isinstance(result, str) else str(result)
                    if summary_text:
                        file_summaries.append(f"{file_name} Summary:\n{summary_text.strip()}")
                except Exception as e:
                    logger.error(f"Error summarizing file {file_name}: {str(e)}")
                    continue

            if not file_summaries:
                return {"error": "Failed to generate any file summaries"}

            combined_summary_text = "\n\n".join(file_summaries)
            final_prompt = f"Based on these individual file summaries, provide a comprehensive overview that connects and synthesizes the main points:\n\n{combined_summary_text}\n\nFinal Overview:"
            final_result = llm(final_prompt)
            final_summary = final_result if isinstance(final_result, str) else str(final_result)

            # Generate PDF
            pdf_path = generate_summary_pdf(
                project_name=project.name,
                summary=final_summary.strip(),
                file_summaries=file_summaries
            )

            # Create a new Document record for the PDF
            summary_document = Document(
                name=f"Summary Report - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                file_path=pdf_path,
                project_id=project_id,
                folder_id=folder_id if folder_id else None,
                content=f"Overall Summary:\n{final_summary.strip()}\n\nDetailed Summaries:\n{combined_summary_text}"
            )
            db.add(summary_document)
            db.commit()
            db.refresh(summary_document)

            return {
                "status": "completed",
                "summary": final_summary.strip(),
                "file_summaries": file_summaries,
                "total_files": len(files),
                "summarized_files": len(file_summaries),
                "pdf_url": pdf_path,
                "document_id": summary_document.id
            }
        except Exception as e:
            logger.error(f"Error in summarization task: {str(e)}")
            return {"error": str(e)}

    # Store the task
    background_tasks[task_id] = asyncio.create_task(process_files())
    
    return {"task_id": task_id}

@app.get("/summarize/{task_id}/status")
async def get_summarize_status(task_id: str):
    task = background_tasks.get(task_id)
    if not task:
        return {"status": "not_found"}
    
    if task.done():
        result = task.result()
        background_tasks.pop(task_id, None)  # Clean up completed task
        return result
    
    return {"status": "processing"}

@app.delete("/summarize/{task_id}")
async def cancel_summarize(task_id: str):
    task = background_tasks.get(task_id)
    if task and not task.done():
        task.cancel()
        background_tasks.pop(task_id, None)
        return {"status": "cancelled"}
    return {"status": "not_found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT) 
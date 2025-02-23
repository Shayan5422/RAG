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
from typing import List
import requests
import base64

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
from models import User, Chat, Project, Document, UserText, TextProjectAssociation, ProjectShare, TextShare
from schemas import ShareRequest, UserResponse, ProjectResponse, TextResponse
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
        # Create project directory if it doesn't exist
        project_dir = UPLOAD_DIR / str(project_id)
        project_dir.mkdir(exist_ok=True)
        
        # Save file
        file_path = project_dir / file.filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Create relative path for database storage
        relative_path = f"/uploads/{project_id}/{file.filename}"

        # Extract text from the uploaded file
        text = extract_text_from_pdf(str(file_path))
        if not text:
            raise HTTPException(status_code=500, detail="Failed to extract text from the file")

        # Create document record with relative path
        document = Document(
            name=file.filename,
            content=text,
            file_path=relative_path,  # Store relative path
            project_id=project_id
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
            "file_path": relative_path  # Return relative path
        }
    except Exception as e:
        logger.error(f"Error uploading document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
        selected_ids = body.get('document_ids', [])

        if not question:
            raise HTTPException(status_code=400, detail="Question is required")
        if not selected_ids:
            raise HTTPException(status_code=400, detail="At least one document or text must be selected")

        # Get selected documents
        documents = db.query(Document).filter(
            Document.id.in_(selected_ids),
            Document.project_id == project_id
        ).all()

        # Get selected texts
        texts = db.query(UserText).join(TextProjectAssociation).filter(
            UserText.id.in_(selected_ids),
            TextProjectAssociation.project_id == project_id
        ).all()

        if not documents and not texts:
            raise HTTPException(status_code=404, detail="No documents or texts found")

        # Combine texts from selected documents and texts
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
            raise HTTPException(status_code=400, detail="No valid content found in selected items")

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

    if not title or not content:
        raise HTTPException(status_code=400, detail="Title and content are required")

    text = UserText(
        title=title,
        content=content,
        user_id=current_user.id
    )
    db.add(text)
    db.commit()
    db.refresh(text)

    # Associate with projects if specified
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
        
        return texts
    else:
        # Get all texts user has access to
        return db.query(UserText).filter(
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
    text_id: int = Form(...),  # Add text_id parameter
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # First check if the text exists and user has access
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

            # Now send the transcription request with the token
            headers = {
                'Authorization': f'Bearer {token}'
            }
            
            # Generate a unique session ID
            session_id = f"session_{timestamp}"
            
            # Prepare the request data as form data
            files = {
                'file': ('chunk.wav', audio_content, 'audio/wav')
            }
            data = {
                'chunk_number': '1',
                'session_id': session_id,
                'model': 'openai/whisper-large-v3-turbo'  # Add default model
            }

            # Use the process-chunk endpoint
            response = requests.post(
                'http://backend.shaz.ai/process-chunk/',
                files=files,
                data=data,
                headers=headers,
                timeout=30
            )

            # Log the response for debugging
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

            # Check for different possible response formats
            transcription = None
            if isinstance(result, dict):
                transcription = (
                    result.get('chunk_transcription') or  # Check for chunk_transcription first
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

        except requests.RequestException as e:
            logger.error(f"Error calling transcription service: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to connect to transcription service: {str(e)}"
            )

        # Append the transcription to the existing text
        try:
            # Add a newline if the existing content doesn't end with one
            if text.content and not text.content.endswith('\n'):
                text.content += '\n'
            
            # Append the new transcription
            text.content += transcription
            
            # Update the text
            db.commit()
            db.refresh(text)

            return {
                "text_id": text.id,
                "title": text.title,
                "content": text.content,
                "created_at": text.created_at,
                "updated_at": text.updated_at,
                "user_id": text.user_id
            }

        except Exception as e:
            db.rollback()
            logger.error(f"Error updating text record: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to update text with transcription")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 
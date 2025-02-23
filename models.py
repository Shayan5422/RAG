from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    chats = relationship("Chat", back_populates="user")
    projects = relationship("Project", back_populates="user")
    shared_projects = relationship("Project", secondary="project_shares", back_populates="shared_users")
    shared_texts = relationship("UserText", secondary="text_shares", back_populates="shared_users")
    created_at = Column(DateTime, default=datetime.utcnow)
    texts = relationship("UserText", back_populates="user")

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="projects")
    documents = relationship("Document", back_populates="project")
    chats = relationship("Chat", back_populates="project")
    shared_users = relationship("User", secondary="project_shares", back_populates="shared_projects")
    folders = relationship("Folder", back_populates="project")

class Folder(Base):
    __tablename__ = "folders"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    parent_folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project = relationship("Project", back_populates="folders")
    parent_folder = relationship("Folder", remote_side=[id], backref="child_folders")
    documents = relationship("Document", back_populates="folder")
    texts = relationship("UserText", back_populates="folder")

class ProjectShare(Base):
    __tablename__ = "project_shares"
    
    project_id = Column(Integer, ForeignKey("projects.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    shared_at = Column(DateTime, default=datetime.utcnow)

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    content = Column(Text)
    file_path = Column(String)
    project_id = Column(Integer, ForeignKey("projects.id"))
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project = relationship("Project", back_populates="documents")
    folder = relationship("Folder", back_populates="documents")

class Chat(Base):
    __tablename__ = "chats"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    project_id = Column(Integer, ForeignKey("projects.id"))
    question = Column(Text)
    answer = Column(Text)
    document_name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="chats")
    project = relationship("Project", back_populates="chats")

class UserText(Base):
    __tablename__ = "user_texts"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)
    user_id = Column(Integer, ForeignKey("users.id"))
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="texts")
    projects = relationship("Project", secondary="text_project_association")
    shared_users = relationship("User", secondary="text_shares", back_populates="shared_texts")
    folder = relationship("Folder", back_populates="texts")

class TextShare(Base):
    __tablename__ = "text_shares"
    
    text_id = Column(Integer, ForeignKey("user_texts.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    shared_at = Column(DateTime, default=datetime.utcnow)

class TextProjectAssociation(Base):
    __tablename__ = "text_project_association"
    
    text_id = Column(Integer, ForeignKey("user_texts.id"), primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# Create database engine
SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

# Create tables
Base.metadata.create_all(bind=engine) 
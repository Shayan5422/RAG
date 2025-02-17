# embeding.py

import logging
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.chains import ConversationalRetrievalChain
from langchain_huggingface import HuggingFacePipeline
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
import torch
import os

# Importing functions from extract_text.py
import extract_text

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# مرحله 1: خواندن متن از فایل استخراج شده
def load_text(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            text = file.read()
        logger.info(f"Loaded text from {file_path}.")
        return text
    except Exception as e:
        logger.error(f"Failed to load text from {file_path}: {e}")
        return ""

# مرحله 2: تقسیم متن به بخش‌های کوچک‌تر
def split_text(text, chunk_size=1000, chunk_overlap=200):
    try:
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )
        chunks = text_splitter.split_text(text)
        logger.info(f"Split text into {len(chunks)} chunks.")
        return chunks
    except Exception as e:
        logger.error(f"Failed to split text: {e}")
        return []

# مرحله 3: ایجاد اشیاء Document از بخش‌های متن
def create_documents(chunks, source="extracted_text.txt"):
    try:
        # Define a minimum length for meaningful content
        MIN_LENGTH = 50
        documents = [Document(page_content=chunk, metadata={"source": source}) for chunk in chunks if len(chunk.strip()) >= MIN_LENGTH]
        logger.info(f"Created {len(documents)} Document objects after filtering.")
        return documents
    except Exception as e:
        logger.error(f"Failed to create Document objects: {e}")
        return []

# مرحله 4: ایجاد embedding با استفاده از مدل لوکال
def create_embeddings(documents):
    try:
        embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        logger.info("Embedding model initialized.")
        return embedding_model
    except Exception as e:
        logger.error(f"Failed to create embeddings: {e}")
        return None

# مرحله 5: ذخیره در وکتور دیتابیس FAISS
def store_embeddings(documents, embedding_model):
    try:
        faiss_db = FAISS.from_documents(documents, embedding_model)
        logger.info(f"FAISS index has {faiss_db.index.ntotal} vectors.")
        return faiss_db
    except Exception as e:
        logger.error(f"Failed to store embeddings in FAISS: {e}")
        return None

# مرحله 6: استفاده از مدل زبانی لوکال برای پاسخ‌دهی
def load_local_llm():
    try:
        model_name = "HuggingFaceTB/SmolLM2-1.7B-Instruct"  # Your local model
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForCausalLM.from_pretrained(model_name)
        
        # Determine the device
        if torch.backends.mps.is_available():
            device = torch.device("mps")
            logger.info("MPS (GPU) detected. Using MPS for inference.")
        elif torch.cuda.is_available():
            device = torch.device("cuda")
            logger.info("CUDA (GPU) detected. Using CUDA for inference.")
        else:
            device = torch.device("cpu")
            logger.info("No GPU detected. Using CPU for inference.")
        
        # Set device index: GPU (0), MPS and CPU (-1)
        if device.type == "cuda":
            device_index = 0  # Assuming single GPU
        else:
            device_index = -1  # MPS and CPU
        
        pipe = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
            device=device_index,  # Use 0 for CUDA GPUs, -1 for CPU/MPS
            max_new_tokens=512,  # Use max_new_tokens instead of max_length
            temperature=0.7,
            top_p=0.9,
            repetition_penalty=1.2,
            do_sample=True  # Enable sampling
        )
        llm = HuggingFacePipeline(pipeline=pipe)
        logger.info("LLM pipeline initialized.")
        return llm
    except Exception as e:
        logger.error(f"Failed to load local LLM: {e}")
        return None

# مرحله 7: تعریف زنجیره ConversationalRetrievalChain
def create_qa_chain(llm, vectorstore):
    try:
        retriever = vectorstore.as_retriever()
        qa_chain = ConversationalRetrievalChain.from_llm(
            llm=llm,
            retriever=retriever,
            return_source_documents=True  # Optional: returns the source documents
        )
        logger.info("ConversationalRetrievalChain initialized.")
        return qa_chain
    except Exception as e:
        logger.error(f"Failed to create QA chain: {e}")
        return None

# تعریف سوالات جداگانه برای هر انومالی


# اجرای برنامه
if __name__ == "__main__":
    # مسیر فولدر پی‌دی‌اف‌ها و فایل خروجی متن استخراج شده
    pdf_folder_path = "/Users/shayanhashemi/Downloads/indice Vert/Fastapi/fastapi-docgpt"  # Replace with your PDF folder path
    extracted_text_path = "extracted_text.txt"  # Output text file path
    
    # مرحله 0: استخراج متن از پی‌دی‌اف‌ها
    try:
        logger.info("Starting text extraction from PDFs.")
        extract_text.extract_text_from_folder(pdf_folder_path, extracted_text_path)
    except Exception as e:
        logger.error(f"Failed to extract text from folder: {e}")
        exit(1)
    
    # مرحله 1: بارگذاری متن استخراج شده
    text = load_text(extracted_text_path)
    if not text:
        logger.error("No text loaded from the extracted file. Exiting.")
        exit(1)
    
    # مرحله 2: تقسیم متن
    chunks = split_text(text)
    if not chunks:
        logger.error("No text chunks created. Exiting.")
        exit(1)
    
    # مرحله 3: ایجاد اشیاء Document
    documents = create_documents(chunks, source=extracted_text_path)
    if not documents:
        logger.error("No Document objects created. Exiting.")
        exit(1)
    
    # مرحله 4: ایجاد embedding
    embedding_model = create_embeddings(documents)
    if not embedding_model:
        logger.error("Embedding model not initialized. Exiting.")
        exit(1)
    
    # مرحله 5: ذخیره در FAISS
    vectorstore = store_embeddings(documents, embedding_model)
    if not vectorstore:
        logger.error("FAISS vector store not created. Exiting.")
        exit(1)
    
    # مرحله 6: بارگذاری LLM
    llm = load_local_llm()
    if not llm:
        logger.error("Local LLM not loaded. Exiting.")
        exit(1)
    
    # مرحله 7: ایجاد زنجیره QA
    qa_chain = create_qa_chain(llm, vectorstore)
    if not qa_chain:
        logger.error("QA chain not initialized. Exiting.")
        exit(1)
    
    # تعریف سوالات جداگانه برای هر انومالی
    
    
   
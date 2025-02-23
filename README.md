# PDF Question Answering System

This is a RAG (Retrieval Augmented Generation) system that allows users to upload PDF documents and ask questions about their content. The system uses advanced NLP techniques to provide accurate answers based on the document's content.

## Features

- Simple web interface for PDF upload and question asking
- PDF text extraction with support for text and tables
- Text chunking and embedding generation
- Question answering using a local language model
- Fast and efficient document retrieval using FAISS

## Prerequisites

- Python 3.8 or higher
- pip (Python package installer)
- Tesseract OCR (for image-based text extraction)

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows, use: venv\Scripts\activate
```

3. Install the required packages:
```bash
pip install -r requirements.txt
```

4. Install Tesseract OCR:
- On macOS: `brew install tesseract`
- On Ubuntu: `sudo apt-get install tesseract-ocr`
- On Windows: Download and install from https://github.com/UB-Mannheim/tesseract/wiki

## Usage

1. Start the server:
```bash
python app.py
```

2. Open your web browser and navigate to:
```
https://api.neurocorengine.com
```

3. Upload a PDF file and ask questions about its content.

## Project Structure

- `app.py`: Main FastAPI application
- `extract_text.py`: PDF text extraction functionality
- `embeding.py`: Text embedding and RAG system implementation
- `templates/`: HTML templates
- `uploads/`: Temporary storage for uploaded files

## Notes

- The system uses a local language model for question answering
- Large PDF files may take longer to process
- The system supports text and table extraction from PDFs
- Temporary files are automatically cleaned up after processing

## License

This project is licensed under the MIT License - see the LICENSE file for details. 
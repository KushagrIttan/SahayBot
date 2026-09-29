const API_BASE_URL = 'http://localhost:8000'; // Assuming FastAPI runs on 8000

export const queryBot = async (question: string) => {
  const response = await fetch(`${API_BASE_URL}/query/?question=${encodeURIComponent(question)}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const ingestPdfs = async (formData: FormData) => {
  const response = await fetch(`${API_BASE_URL}/ingest_pdfs/`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};
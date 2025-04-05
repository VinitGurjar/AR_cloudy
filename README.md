# Image to 3D Model Conversion API

A Cloudflare Workers backend for handling image uploads and 3D GLB file storage. This backend is designed to work with a Next.js frontend deployed on Vercel.

## Features

- Image upload handling with R2 storage
- 3D model storage and retrieval
- Conversion status tracking with D1 database
- CORS support for frontend integration

## Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account with Workers, R2, and D1 access

### Installation

1. **Install Wrangler CLI**

   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**

   ```bash
   wrangler login
   ```

3. **Create R2 bucket**

   ```bash
   wrangler r2 bucket create image-to-3d-storage
   ```

4. **Create D1 database**

   ```bash
   wrangler d1 create image-to-3d-db
   ```
   
   Take note of the database ID returned by this command and update it in `wrangler.toml`.

5. **Apply database schema**

   ```bash
   wrangler d1 execute image-to-3d-db --file=schema.sql
   ```

### Deployment

1. **Deploy the worker**

   ```bash
   wrangler publish
   ```

2. **Note your worker's URL**

   After deployment, Wrangler will display your worker's URL, which will look something like:
   `https://image-to-3d-api.your-username.workers.dev`

## API Endpoints

### Upload Image

- **URL**: `/upload`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `image`: The image file to upload
- **Response**: JSON with file ID and URLs
  ```json
  {
    "id": "uuid",
    "status": "pending",
    "imageUrl": "/image/uuid",
    "modelUrl": "/model/uuid"
  }
  ```

### Check Conversion Status

- **URL**: `/status?id=uuid`
- **Method**: `GET`
- **Response**: JSON with conversion status
  ```json
  {
    "id": "uuid",
    "status": "completed",
    "imageUrl": "/image/uuid",
    "modelUrl": "/model/uuid",
    "created_at": "2023-01-01T00:00:00.000Z",
    "updated_at": "2023-01-01T00:00:10.000Z"
  }
  ```

### Get Image

- **URL**: `/image/:id`
- **Method**: `GET`
- **Response**: The image file with appropriate content type

### Get 3D Model

- **URL**: `/model/:id`
- **Method**: `GET`
- **Response**: The GLB file with content type `model/gltf-binary`

## Integration with Next.js Frontend

### Example: Upload an Image

```typescript
// In your Next.js component
import { useState } from 'react';

const API_URL = 'https://image-to-3d-api.your-username.workers.dev';

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);
      
      // Start polling for conversion status
      if (data.id) {
        pollConversionStatus(data.id);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const pollConversionStatus = async (id: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/status?id=${id}`);
        const data = await response.json();
        
        setResult(data);
        
        if (data.status === 'completed' || data.status === 'failed') {
          // Conversion finished
          return true;
        }
        return false;
      } catch (error) {
        console.error('Status check failed:', error);
        return true; // Stop polling on error
      }
    };
    
    // Check immediately
    const isDone = await checkStatus();
    if (!isDone) {
      // Continue checking every 3 seconds
      const intervalId = setInterval(async () => {
        const isDone = await checkStatus();
        if (isDone) {
          clearInterval(intervalId);
        }
      }, 3000);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
        <button type="submit" disabled={!file || loading}>
          {loading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
      
      {result && (
        <div>
          <h3>Status: {result.status}</h3>
          {result.status === 'completed' && (
            <div>
              <img 
                src={`${API_URL}${result.imageUrl}`} 
                alt="Uploaded image" 
                style={{ maxWidth: '300px' }} 
              />
              <p>
                <a 
                  href={`${API_URL}${result.modelUrl}`} 
                  download="model.glb"
                >
                  Download 3D Model
                </a>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

## Important Notes

1. **3D Conversion**: This example includes a placeholder for 3D conversion. In a real-world implementation, you would need to integrate with a 3D conversion service or implement your own conversion logic.

2. **Security**: Consider adding authentication to protect your API endpoints.

3. **Limits**: Be aware of Cloudflare's limits for Workers, R2, and D1.

4. **Costs**: Check Cloudflare's pricing for Workers, R2, and D1 usage.

## License

MIT

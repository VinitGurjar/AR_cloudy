/**
 * Image to 3D Model Conversion API
 * Cloudflare Worker backend for storing images and 3D GLB files
 */

// Main entry point for the worker
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return handleCors(request);
    }

    // Add CORS headers to all responses
    const corsHeaders = getCorsHeaders();
    
    // Parse the URL and route the request
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Route based on the path and method
      if (path === "/upload" && request.method === "POST") {
        return await handleUpload(request, env, corsHeaders);
      } else if (path.startsWith("/image/") && request.method === "GET") {
        const id = path.split("/").pop();
        return await getImage(id, env, corsHeaders);
      } else if (path.startsWith("/model/") && request.method === "GET") {
        const id = path.split("/").pop();
        return await getModel(id, env, corsHeaders);
      } else if (path === "/status" && request.method === "GET") {
        const id = url.searchParams.get("id");
        if (!id) {
          return jsonResponse({ error: "Missing id parameter" }, 400, corsHeaders);
        }
        return await getConversionStatus(id, env, corsHeaders);
      } else {
        return jsonResponse({ error: "Not found" }, 404, corsHeaders);
      }
    } catch (error) {
      console.error("Error processing request:", error);
      return jsonResponse(
        { error: "Internal server error", message: error.message },
        500,
        corsHeaders
      );
    }
  },
};

/**
 * Handle CORS preflight requests
 */
function handleCors() {
  return new Response(null, {
    headers: getCorsHeaders(),
  });
}

/**
 * Get CORS headers for responses
 */
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Create a JSON response with appropriate headers
 */
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Handle file upload requests
 */
async function handleUpload(request, env, corsHeaders) {
  // Check if the request is multipart/form-data
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonResponse(
      { error: "Expected multipart/form-data" },
      400,
      corsHeaders
    );
  }

  try {
    // Parse the form data
    const formData = await request.formData();
    const imageFile = formData.get("image");

    // Validate the image file
    if (!imageFile || typeof imageFile === "string") {
      return jsonResponse(
        { error: "No image file provided" },
        400,
        corsHeaders
      );
    }

    // Generate a unique ID for this upload
    const id = crypto.randomUUID();
    
    // Store the image in R2
    const imageKey = `images/${id}`;
    await env.STORAGE.put(imageKey, imageFile.stream(), {
      httpMetadata: {
        contentType: imageFile.type,
      },
    });

    // Create a record in the database
    await env.DB.prepare(
      `INSERT INTO conversions (id, image_key, status, created_at)
       VALUES (?, ?, ?, ?)`
    )
      .bind(id, imageKey, "pending", new Date().toISOString())
      .run();

    // Queue the conversion process
    // In a real implementation, this would trigger a 3D conversion service
    ctx.waitUntil(simulateConversion(id, env));

    // Return the ID and URLs for the client
    return jsonResponse(
      {
        id,
        status: "pending",
        imageUrl: `/image/${id}`,
        modelUrl: `/model/${id}`,
      },
      202,
      corsHeaders
    );
  } catch (error) {
    console.error("Upload error:", error);
    return jsonResponse(
      { error: "Failed to process upload", message: error.message },
      500,
      corsHeaders
    );
  }
}

/**
 * Simulate the 3D conversion process
 * In a real implementation, this would call an external service or use a Worker
 */
async function simulateConversion(id, env) {
  try {
    // Update status to processing
    await env.DB.prepare(
      `UPDATE conversions SET status = ?, updated_at = ? WHERE id = ?`
    )
      .bind("processing", new Date().toISOString(), id)
      .run();

    // Simulate processing time (5-10 seconds)
    await new Promise((resolve) => setTimeout(resolve, 5000 + Math.random() * 5000));

    // Get the conversion record
    const record = await env.DB.prepare(
      `SELECT image_key FROM conversions WHERE id = ?`
    )
      .bind(id)
      .first();

    if (!record) {
      throw new Error(`Conversion record not found: ${id}`);
    }

    // Get the original image
    const image = await env.STORAGE.get(record.image_key);
    if (!image) {
      throw new Error(`Image not found: ${record.image_key}`);
    }

    // In a real implementation, you would convert the image to a 3D model here
    // For this example, we'll just create a placeholder GLB file
    const modelKey = `models/${id}.glb`;
    
    // This is a minimal valid GLB file structure (empty model)
    // In a real implementation, this would be the result of the conversion
    const placeholderGlb = new Uint8Array([
      // GLB header (magic + version + length)
      0x67, 0x6C, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00,
      0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // JSON chunk header (length + type)
      0x1C, 0x00, 0x00, 0x00, 0x4A, 0x53, 0x4F, 0x4E,
      // JSON content (minimal valid glTF)
      0x7B, 0x22, 0x61, 0x73, 0x73, 0x65, 0x74, 0x73, 0x22, 0x3A, 0x7B, 0x7D, 0x2C,
      0x22, 0x73, 0x63, 0x65, 0x6E, 0x65, 0x22, 0x3A, 0x30, 0x2C, 0x22, 0x73, 0x63,
      0x65, 0x6E, 0x65, 0x73, 0x22, 0x3A, 0x5B, 0x7B, 0x7D, 0x5D, 0x7D, 0x00,
      // BIN chunk header (length + type)
      0x00, 0x00, 0x00, 0x00, 0x42, 0x49, 0x4E, 0x00
    ]);

    // Store the model in R2
    await env.STORAGE.put(modelKey, placeholderGlb, {
      httpMetadata: {
        contentType: "model/gltf-binary",
      },
    });

    // Update the database record
    await env.DB.prepare(
      `UPDATE conversions 
       SET model_key = ?, status = ?, updated_at = ? 
       WHERE id = ?`
    )
      .bind(modelKey, "completed", new Date().toISOString(), id)
      .run();

  } catch (error) {
    console.error("Conversion error:", error);
    
    // Update the database record with the error
    await env.DB.prepare(
      `UPDATE conversions 
       SET status = ?, error = ?, updated_at = ? 
       WHERE id = ?`
    )
      .bind("failed", error.message, new Date().toISOString(), id)
      .run();
  }
}

/**
 * Get the status of a conversion
 */
async function getConversionStatus(id, env, corsHeaders) {
  const record = await env.DB.prepare(
    `SELECT status, error, created_at, updated_at FROM conversions WHERE id = ?`
  )
    .bind(id)
    .first();

  if (!record) {
    return jsonResponse({ error: "Conversion not found" }, 404, corsHeaders);
  }

  return jsonResponse({
    id,
    status: record.status,
    error: record.error,
    created_at: record.created_at,
    updated_at: record.updated_at,
    imageUrl: `/image/${id}`,
    modelUrl: `/model/${id}`,
  }, 200, corsHeaders);
}

/**
 * Get an image from storage
 */
async function getImage(id, env, corsHeaders) {
  try {
    // Get the image key from the database
    const record = await env.DB.prepare(
      `SELECT image_key FROM conversions WHERE id = ?`
    )
      .bind(id)
      .first();

    if (!record) {
      return jsonResponse({ error: "Image not found" }, 404, corsHeaders);
    }

    // Get the image from R2
    const object = await env.STORAGE.get(record.image_key);
    if (!object) {
      return jsonResponse(
        { error: "Image not found in storage" },
        404,
        corsHeaders
      );
    }

    // Return the image with appropriate headers
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata.contentType,
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Get image error:", error);
    return jsonResponse(
      { error: "Failed to retrieve image" },
      500,
      corsHeaders
    );
  }
}

/**
 * Get a 3D model from storage
 */
async function getModel(id, env, corsHeaders) {
  try {
    // Get the model key and status from the database
    const record = await env.DB.prepare(
      `SELECT model_key, status FROM conversions WHERE id = ?`
    )
      .bind(id)
      .first();

    if (!record) {
      return jsonResponse({ error: "Model not found" }, 404, corsHeaders);
    }

    // Check if the model is still processing
    if (record.status === "pending" || record.status === "processing") {
      return jsonResponse(
        {
          status: record.status,
          message: "The 3D model is still being processed. Please check back later.",
        },
        202,
        corsHeaders
      );
    }

    // Check if the conversion failed
    if (record.status === "failed") {
      return jsonResponse(
        {
          status: "failed",
          message: "Failed to generate the 3D model.",
        },
        500,
        corsHeaders
      );
    }

    // Get the model from R2
    const object = await env.STORAGE.get(record.model_key);
    if (!object) {
      return jsonResponse(
        { error: "Model not found in storage" },
        404,
        corsHeaders
      );
    }

    // Return the model with appropriate headers
    return new Response(object.body, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("Get model error:", error);
    return jsonResponse(
      { error: "Failed to retrieve model" },
      500,
      corsHeaders
    );
  }
}

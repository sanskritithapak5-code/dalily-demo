// This is a serverless function that runs on Vercel

async function callHuggingFaceAPI(text, maxRetries = 10, retryDelay = 3000) {
    const API_URL = "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english";
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`Attempt ${i + 1} to call Hugging Face...`);
            const hfResponse = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HUGGING_FACE_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ inputs: text })
            });

            // FIRST, get the response as text. Don't assume it's JSON!
            const responseText = await hfResponse.text();
            console.log("Raw response from Hugging Face:", responseText);

            let data;
            try {
                // NOW try to parse it as JSON
                data = JSON.parse(responseText);
            } catch (parseError) {
                // If it's not JSON, handle the plain text error
                console.error("Failed to parse response as JSON:", responseText);
                if (responseText.includes("Not Found")) {
                    throw new Error(`The AI model was not found. Please check the API URL.`);
                } else {
                    throw new Error(`Unexpected response from AI server: ${responseText}`);
                }
            }

            // 1. CHECK FOR MODEL LOADING ERROR
            if (data.error && data.error.includes("loading")) {
                console.log(`Model is loading. Retrying in ${retryDelay/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
            }

            // 2. CHECK FOR ANY OTHER ERROR FROM HUGGING FACE
            if (data.error) {
                console.error("Hugging Face API Error:", data.error);
                throw new Error(`Hugging Face Error: ${data.error}`);
            }

            // 3. CHECK FOR A VALID RESPONSE STRUCTURE
            if (!Array.isArray(data) || !data[0] || !Array.isArray(data[0])) {
                console.error("Unexpected response structure:", data);
                throw new Error('Received unexpected data format from AI service.');
            }

            // 4. IF SUCCESS, RETURN THE DATA!
            console.log("Success on attempt", i + 1);
            return data;

        } catch (error) {
            console.error("Error in attempt", i + 1, ":", error.message);
            
            // If it's a "Not Found" error or other critical error, fail immediately
            if (error.message.includes("Not Found") || error.message.includes("Unexpected response")) {
                throw error; // Re-throw the error to break the loop
            }
            
            // For other errors, wait and retry
            if (i < maxRetries - 1) {
                console.log(`Retrying in ${retryDelay/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                // Final attempt failed
                throw new Error('The AI service is unavailable after multiple attempts. Please try again later.');
            }
        }
    }
}

// The main request handler function
export default async function handler(request, response) {
    // Set CORS headers to allow requests from your frontend
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request (important for Vercel)
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    // Only allow POST requests for the actual analysis
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { text } = request.body;

        if (!text) {
            return response.status(400).json({ error: 'Text is required' });
        }

        // Call the Hugging Face API with retry logic
        const data = await callHuggingFaceAPI(text);
        
        // If successful, return the data
        return response.status(200).json(data);

    } catch (error) {
        console.error("Final error in handler:", error.message);
        return response.status(500).json({ error: error.message });
    }
}

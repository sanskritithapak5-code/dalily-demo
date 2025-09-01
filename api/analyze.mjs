// This is a serverless function that runs on Vercel
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

    const { text } = request.body;

    if (!text) {
        return response.status(400).json({ error: 'Text is required' });
    }

    // CORRECTED API URL - Added a missing slash and verified the model name
    const API_URL = "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english";
    const MAX_RETRIES = 10;
    const RETRY_DELAY = 3000;

    for (let i = 0; i < MAX_RETRIES; i++) {
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
                console.log(`Model is loading. Retrying in ${RETRY_DELAY/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                continue;
            }

            // 2. CHECK FOR ANY OTHER ERROR FROM HUGGING FACE
            if (data.error) {
                console.error("Hugging Face API Error:", data.error);
                return response.status(500).json({ error: `Hugging Face Error: ${data.error}` });
            }

            // 3. CHECK FOR A VALID RESPONSE STRUCTURE
            if (!Array.isArray(data) || !data[0] || !Array.isArray(data[0])) {
                console.error("Unexpected response structure:", data);
                return response.status(500).json({ error: 'Received unexpected data format from AI service.' });
            }

            // 4. IF SUCCESS, SEND THE DATA BACK!
            console.log("Success on attempt", i + 1);
            return response.status(200).json(data);

        } catch (error) {
            console.error("Error in attempt", i + 1, ":", error.message);
            
            // If it's a "Not Found" error or other critical error, fail immediately
            if (error.message.includes("Not Found") || error.message.includes("Unexpected response")) {
                return response.status(500).json({ error: error.message });
            }
            
            // For other errors, wait and retry
            if (i < MAX_RETRIES - 1) {
                console.log(`Retrying in ${RETRY_DELAY/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            } else {
                // Final attempt failed
                return response.status(503).json({ error: 'The AI service is unavailable after multiple attempts. Please try again later.' });
            }
        }
    }
}
    console.error("Model failed to load after multiple retries.");
    return response.status(503).json({ error: 'The AI model is taking too long to load. Please try again in a moment.' });
}

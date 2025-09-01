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

    const API_URL = "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english";
    const MAX_RETRIES = 10; // Try for 10 times
    const RETRY_DELAY = 3000; // Wait 3 seconds between tries

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

            const data = await hfResponse.json();

            // 1. CHECK FOR MODEL LOADING ERROR
            if (data.error && data.error.includes("loading")) {
                console.log(`Model is loading. Retrying in ${RETRY_DELAY/1000} seconds...`);
                // Wait for RETRY_DELAY milliseconds before trying again
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                continue; // Go to the next loop iteration (retry)
            }

            // 2. CHECK FOR ANY OTHER ERROR
            if (data.error) {
                console.error("Hugging Face API Error:", data.error);
                return response.status(500).json({ error: `Hugging Face Error: ${data.error}` });
            }

            // 3. IF SUCCESS, SEND THE DATA BACK!
            console.log("Success on attempt", i + 1);
            return response.status(200).json(data);

        } catch (error) {
            console.error("Network/Server Error:", error);
            return response.status(500).json({ error: 'Internal server error' });
        }
    }

    // If we get here, we've used all our retries
    console.error("Model failed to load after multiple retries.");
    return response.status(503).json({ error: 'The AI model is taking too long to load. Please try again in a moment.' });
}

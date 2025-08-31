// This is a serverless function that runs on Vercel
export default async function handler(request, response) {
    // Only allow POST requests
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    const { text } = request.body;

    if (!text) {
        return response.status(400).json({ error: 'Text is required' });
    }

    // The FREE Hugging Face model we are using
    const API_URL = "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english";

    try {
        // Forward the request to Hugging Face
        const hfResponse = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.HUGGING_FACE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ inputs: text })
        });

        const data = await hfResponse.json();

        // Send Hugging Face's response back to our frontend
        response.status(200).json(data);
    } catch (error) {
        console.error("Error in serverless function:", error);
        response.status(500).json({ error: 'Internal server error' });
    }
}

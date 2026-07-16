import { GoogleGenAI, Type } from "@google/genai";
import { DB } from "./db.js";

// Initialize the Google Gen AI client with appropriate telemetry headers
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const MODEL_NAME = 'gemini-3.5-flash';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

/**
 * Interactive Travel Chatbot
 * Grounded with actual train database context!
 */
export async function chatWithAI(userMessage: string, history: ChatMessage[] = []): Promise<string> {
  const trains = DB.getTrains();
  const stations = DB.getStations();

  // Create a compact list of stations & trains to feed as context for grounding
  const stationsContext = stations.slice(0, 15).map(s => `${s.name} (${s.code}) - ${s.city}, ${s.state}`).join(', ');
  const premiumTrains = trains.slice(0, 12).map(t => `${t.trainName} [${t.trainNumber}] runs from ${t.source} to ${t.destination} on ${t.runningDays.join('/')}`).join('\n');

  const systemInstruction = `You are RailConnect AI, an intelligent, helpful, and courteous travel assistant for the Indian Railways booking platform RailConnect.
Your goal is to guide users with accurate route recommendations, train ticket advice, general railway rules, fare estimations, packing tips, and train bookings.
You have access to some real train and station database context to ground your recommendations.

Contextual Stations:
${stationsContext} ... and more.

Contextual Top Trains:
${premiumTrains} ... and many more.

Format your responses in clean, brief Markdown paragraphs. Use polite Indian railway greetings (e.g., "Welcome to RailConnect AI!"). If a train isn't explicitly in the top trains list, suggest the user can search for it directly on our search page. Always remain polite and professional. Keep answers under 200 words.`;

  try {
    // Build the generative chat
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        ...history.map(h => ({
          role: h.role,
          parts: [{ text: h.text }]
        })),
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    return response.text || "I'm sorry, I encountered a brief issue. How may I assist you with your train reservation?";
  } catch (error) {
    console.error("Gemini API error in chatWithAI:", error);
    return "Welcome to RailConnect AI! I'm here to assist you. Although I had a connectivity issue with my AI brain, you can search for trains, check seating availability, and book tickets easily using the search panel above!";
  }
}

/**
 * Converts a natural language phrase into a structured search query.
 * Example: "I want to travel from Delhi to Pune next Wednesday"
 * Returns: { source: "NDLS", destination: "PUNE", date: "2026-07-22" } or closest station matches
 */
export async function parseNLPQuery(queryText: string): Promise<{
  source: string;
  destination: string;
  date: string;
  classPreference?: string;
  success: boolean;
}> {
  const stations = DB.getStations();
  const stationsMap = stations.map(s => ({ code: s.code, name: s.name, city: s.city }));

  const prompt = `Convert this natural language railway search query into structured search parameters: "${queryText}".
You must match the source and destination cities/names to the closest code in our station database:
${JSON.stringify(stationsMap.slice(0, 40))}

Current Local Time: ${new Date().toISOString()}.
Find the absolute best fitting Station Code for 'source' and 'destination'.
If date is relative (e.g., "next Friday", "tomorrow"), calculate the exact YYYY-MM-DD string.
Also extract a preferred class type if mentioned (e.g. "SL", "3A", "2A", "1A") or return undefined.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            source: { type: Type.STRING, description: "Source station code, e.g. NDLS" },
            destination: { type: Type.STRING, description: "Destination station code, e.g. PUNE" },
            date: { type: Type.STRING, description: "YYYY-MM-DD date representation" },
            classPreference: { type: Type.STRING, description: "Matched class, e.g. 3A" },
            explanation: { type: Type.STRING, description: "Short explanation of translation" }
          },
          required: ["source", "destination", "date"]
        }
      }
    });

    const parsed = JSON.parse(response.text.trim());
    return {
      source: parsed.source,
      destination: parsed.destination,
      date: parsed.date,
      classPreference: parsed.classPreference,
      success: true
    };
  } catch (error) {
    console.error("Gemini NLP parsing error:", error);
    // Simple regex fallback if AI fails
    const lower = queryText.toLowerCase();
    let source = "NDLS";
    let destination = "BPL";
    
    // Find matching station codes or cities
    for (const s of stations) {
      if (lower.includes(s.city.toLowerCase()) || lower.includes(s.name.toLowerCase())) {
        if (!lower.indexOf(s.city.toLowerCase()) || lower.indexOf(s.city.toLowerCase()) < lower.indexOf(" to ")) {
          source = s.code;
        } else {
          destination = s.code;
        }
      }
    }

    // Default to tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    return {
      source,
      destination,
      date: dateStr,
      success: false
    };
  }
}

/**
 * Estimates crowd occupancy level (High, Medium, Low) for a train class and date
 */
export function estimateCrowdOccupancy(trainId: string, journeyDate: string, classType: string): {
  level: 'Low' | 'Medium' | 'High';
  percentage: number;
  description: string;
} {
  const train = DB.getTrains().find(t => t.id === trainId);
  if (!train) {
    return { level: 'Medium', percentage: 50, description: "Average occupancy predicted." };
  }

  // Calculate actual current booking counts
  const bookings = DB.getBookings().filter(b => b.trainId === trainId && b.journeyDate === journeyDate && b.classType === classType && b.status !== 'Cancelled');
  const bookedHeadcount = bookings.reduce((sum, b) => sum + b.passengers.length, 0);
  const capacity = train.seatCapacity[classType] || 60;

  let percentage = Math.round((bookedHeadcount / capacity) * 100);
  if (percentage === 0) {
    // Add stable pseudo-randomness based on date and trainId to make it realistic
    const charSum = trainId.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) + new Date(journeyDate).getDate();
    percentage = 20 + (charSum % 60); // stable variation between 20% and 80%
  }

  let level: 'Low' | 'Medium' | 'High' = 'Medium';
  let description = "Moderate passenger occupancy expected. Comfortable seating available.";

  if (percentage < 45) {
    level = 'Low';
    description = "Low passenger traffic predicted. High chances of booking preferred berths.";
  } else if (percentage > 75) {
    level = 'High';
    description = "Heavily loaded journey. Expect a crowded train; booking in advance highly recommended.";
  }

  return {
    level,
    percentage,
    description
  };
}

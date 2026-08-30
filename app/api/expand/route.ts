import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are a senior software architect and technical product specification writer.

Your task is to transform a short product idea into a long, implementation-ready technical specification. Do not merely paraphrase the idea. Resolve reasonable ambiguities with explicit assumptions.

Return the result in this exact structure:

1. PROJECT OVERVIEW
- Product purpose
- Target users
- Core problem
- Success criteria

2. FUNCTIONAL REQUIREMENTS
- Numbered features with detailed behavior
- User flows
- Validation and error states
- Empty/loading/success states

3. UI/UX SPECIFICATION
- Page/screen structure
- Component hierarchy
- Responsive behavior
- Accessibility requirements
- Interaction states

4. TECHNICAL ARCHITECTURE
- Recommended frontend stack
- Backend/API architecture
- Data flow
- State management
- Security considerations
- Environment variables

5. API CONTRACTS
For every endpoint, specify method, path, request shape, response shape, validation, and failure cases.

6. DATA MODEL
If persistence is not required, explicitly state that. Otherwise describe entities and relationships without inventing a database unless the idea requires one.

7. IMPLEMENTATION PLAN
Give an ordered plan that a developer can execute from setup through deployment.

8. EDGE CASES AND TEST PLAN
Include important edge cases and concrete acceptance tests.

9. READY-TO-USE CHATGPT PROMPT
End with a polished prompt that instructs ChatGPT to build the project. The prompt must include the requirements, constraints, stack, expected file structure, API behavior, UI requirements, and quality checks.

Rules:
- Be technically specific and practical.
- Prefer maintainable, production-oriented solutions.
- Never claim an API, package, or capability exists if it is uncertain; mark uncertain assumptions clearly.
- Do not include secrets or hard-code API keys.
- If the idea is underspecified, make sensible assumptions and list them rather than asking follow-up questions.`;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });

    const body = await request.json();
    const idea = typeof body.idea === 'string' ? body.idea.trim() : '';
    if (!idea) return NextResponse.json({ error: 'Idea is required.' }, { status: 400 });
    if (idea.length > 20_000) return NextResponse.json({ error: 'Idea is limited to 20,000 characters.' }, { status: 413 });

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { temperature: 0.35, maxOutputTokens: 8192 },
    });

    const result = await model.generateContent(idea);
    const expanded = result.response.text().trim();
    if (!expanded) return NextResponse.json({ error: 'Gemini returned an empty response.' }, { status: 502 });

    return NextResponse.json({ expanded });
  } catch (error) {
    console.error('Gemini expansion error:', error);
    return NextResponse.json({ error: 'Gemini request failed. Check the server key, model name, quota, and API access.' }, { status: 502 });
  }
}

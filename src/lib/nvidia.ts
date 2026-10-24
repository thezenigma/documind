import "server-only";

const BASE = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

async function requestEmbeddings(inputs: string[], inputType: "passage" | "query"): Promise<number[][]> {
  const model = process.env.NVIDIA_EMBEDDING_MODEL;
  if (!model) throw new Error("NVIDIA_EMBEDDING_MODEL is not set.");
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: inputs, model, input_type: inputType }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Embedding request failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { data: Array<{ index: number; embedding: number[] }> };
  if (!Array.isArray(json.data) || json.data.length !== inputs.length) {
    throw new Error("Embedding response was incomplete.");
  }
  return [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Document passages, indexed once at upload time. */
export async function embedPassages(texts: string[]): Promise<number[][]> {
  return requestEmbeddings(texts, "passage");
}

/** The user's question at ask time. The model is asymmetric: query and passage embeddings differ. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await requestEmbeddings([text], "query");
  return vector;
}

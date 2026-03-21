import Anthropic from '@anthropic-ai/sdk';

const AVERAGE_TOKENS_PER_TOOL = 750;

let client = null;

function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Count tokens for a set of MCP tool definitions using the Anthropic API.
 * Falls back to estimation if API key is not available.
 */
export async function countToolTokens(tools) {
  const anthropic = getClient();

  if (!anthropic) {
    // Fallback: estimate based on tool count
    console.warn('No ANTHROPIC_API_KEY set, using estimation');
    return estimateTokens(tools);
  }

  try {
    // Format tools as Anthropic tool definitions
    const anthropicTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema || tool.input_schema || {
        type: 'object',
        properties: {},
      },
    }));

    const result = await anthropic.messages.count_tokens({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'test' }],
      tools: anthropicTools,
    });

    // Subtract base tokens (message without tools)
    const baseResult = await anthropic.messages.count_tokens({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'test' }],
    });

    return {
      tokens: result.input_tokens - baseResult.input_tokens,
      method: 'api',
      model: 'claude-sonnet-4-20250514',
    };
  } catch (err) {
    console.warn(`API token counting failed: ${err.message}, falling back to estimation`);
    return estimateTokens(tools);
  }
}

function estimateTokens(tools) {
  return {
    tokens: tools.length * AVERAGE_TOKENS_PER_TOOL,
    method: 'estimate',
    model: null,
  };
}

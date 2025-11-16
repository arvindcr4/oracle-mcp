#!/usr/bin/env node
import 'dotenv/config';
import process from 'node:process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runOracle, extractTextOutput, type ModelName, type RunOracleOptions } from '../src/oracle.js';
import { getCliVersion } from '../src/version.js';

const MODEL_NAMES = ['gpt-5-pro', 'gpt-5.1'] as const;

async function main(): Promise<void> {
  const server = new McpServer(
    {
      name: '@steipete/oracle-mcp',
      version: getCliVersion(),
    },
    {},
  );

  server.registerTool(
    'oracle.query',
    {
      title: 'Oracle GPT-5 Query',
      description:
        'Run a one-shot Oracle query using GPT-5 Pro / GPT-5.1 with optional file context and server-side search.',
      inputSchema: z.object({
        prompt: z.string().min(1, 'Prompt is required.').describe('User prompt to send to Oracle.'),
        model: z
          .enum(MODEL_NAMES)
          .optional()
          .describe('Model key to use (gpt-5-pro or gpt-5.1). Defaults to gpt-5-pro.'),
        files: z
          .array(z.string())
          .optional()
          .describe('Optional list of file paths to attach, relative to the working directory.'),
        system: z.string().optional().describe('Optional system prompt override.'),
        maxInput: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional override for the input token budget.'),
        maxOutput: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional override for the maximum output tokens.'),
        background: z
          .boolean()
          .optional()
          .describe('If true, run the request using the Responses API background mode.'),
        search: z
          .boolean()
          .optional()
          .describe('Enable or disable the server-side search tool (default: on).'),
      }),
    },
    async (input) => {
      const {
        prompt,
        model = 'gpt-5-pro',
        files,
        system,
        maxInput,
        maxOutput,
        background,
        search,
      } = input;

      const modelName: ModelName = (model ?? 'gpt-5-pro') as ModelName;

      const runOptions: RunOracleOptions = {
        prompt,
        model: modelName,
        file: files,
        system,
        maxInput,
        maxOutput,
        background,
        search,
        filesReport: false,
        silent: true,
        preview: false,
        previewMode: undefined,
        verbose: false,
      };

      const result = await runOracle(runOptions, {
        cwd: process.cwd(),
        log: () => {},
        write: () => true,
      });

      if (result.mode === 'preview') {
        const summary = [
          'Oracle returned a preview result.',
          `Estimated input tokens: ${result.estimatedInputTokens.toLocaleString()}`,
          `Input token budget: ${result.inputTokenBudget.toLocaleString()}`,
        ].join('\n');
        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
        };
      }

      const text = extractTextOutput(result.response) || '(no text output)';
      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Oracle MCP server failed:', error);
  process.exit(1);
});

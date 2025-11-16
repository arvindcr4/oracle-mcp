#!/usr/bin/env node
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs/promises';
import type { BrowserAutomationConfig } from '../src/browser/index.js';
import { runBrowserMode } from '../src/browser/index.js';
import { readFiles } from '../src/oracle/files.js';
import { getCliVersion } from '../src/version.js';

async function main(): Promise<void> {
  const server = new McpServer(
    {
      name: '@steipete/oracle-mcp',
      version: getCliVersion(),
    },
    {},
  );

  server.registerTool(
    'oracle.browserQuery',
    {
      title: 'Oracle Browser GPT-5 Query',
      description:
        'Run a one-shot Oracle query using the browser-based ChatGPT automation (no direct API key required).',
      inputSchema: z.object({
        prompt: z.string().min(1, 'Prompt is required.').describe('User prompt to send to Oracle.'),
        files: z
          .array(z.string())
          .optional()
          .describe('Optional list of file paths to attach, relative to the working directory.'),
        chromeProfile: z
          .string()
          .optional()
          .describe('Optional Chrome profile name to reuse cookies from (e.g., "Default").'),
        chromePath: z
          .string()
          .optional()
          .describe('Optional path to the Chrome/Chromium binary. Defaults to the system Chrome.'),
        headless: z.boolean().optional().describe('Launch Chrome in headless mode. Defaults to false.'),
        keepBrowser: z
          .boolean()
          .optional()
          .describe('If true, keep Chrome running after completion. Defaults to false.'),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum time in milliseconds to wait for a response. Defaults to 900000 (15 minutes).'),
        inputTimeoutMs: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum time in milliseconds to wait for the prompt input to be ready.'),
        cookieSync: z
          .boolean()
          .optional()
          .describe('Whether to sync cookies from the local Chrome profile. Defaults to true.'),
        allowCookieErrors: z
          .boolean()
          .optional()
          .describe('If true, ignore cookie sync errors instead of failing.'),
      }),
    },
    async (input) => {
      const { prompt, files, chromeProfile, chromePath, headless, keepBrowser, timeoutMs, inputTimeoutMs, cookieSync, allowCookieErrors } =
        input;

      const cwd = process.cwd();
      const attachments = [];
      if (files && files.length > 0) {
        const resolved = await readFiles(files, { cwd });
        for (const file of resolved) {
          const stats = await fs.stat(file.path);
          attachments.push({
            path: file.path,
            displayPath: path.relative(cwd, file.path) || file.path,
            sizeBytes: stats.size,
          });
        }
      }

      const config: BrowserAutomationConfig = {
        chromeProfile: chromeProfile ?? undefined,
        chromePath: chromePath ?? undefined,
        headless,
        keepBrowser,
        timeoutMs,
        inputTimeoutMs,
        cookieSync,
        allowCookieErrors,
      };

      const result = await runBrowserMode({
        prompt,
        attachments,
        config,
        verbose: false,
      });

      const text = result.answerMarkdown || result.answerText || '(no text output)';
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

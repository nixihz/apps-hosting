#!/usr/bin/env node
import { runDeveloperCommand } from '../src/developer-cli.js';

const args = process.argv.slice(2);
const command = args[0];

try {
  await runDeveloperCommand(command, args.slice(1), { binaryName: 'keli-cli' });
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

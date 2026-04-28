import { spawn } from 'node:child_process';

const limit = process.env.PRICE_LIMIT || '104';
const jobs = [
  ['dfs:pvc:mapped', ['--', `--limit=${limit}`]],
  ['fb:pvc:mapped', ['--', `--limit=${limit}`]],
  ['fv:pvc:mapped', ['--', `--limit=${limit}`]],
];

function run(script, args = []) {
  return new Promise(resolve => {
    console.log(`\n=== ${script} ${args.join(' ')} ===`);
    const child = spawn('npm', ['run', script, ...args], { stdio: 'inherit', shell: false });
    child.on('close', code => resolve({ script, code }));
  });
}

const results = [];
for (const [script, args] of jobs) {
  results.push(await run(script, args));
}

await run('data:sync');

const failed = results.filter(r => r.code !== 0);
if (failed.length) {
  console.error('Provider update failures:', failed);
  process.exitCode = 1;
} else {
  console.log('All providers updated successfully.');
}

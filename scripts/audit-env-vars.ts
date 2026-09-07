import fs from 'fs';
import path from 'path';

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (['node_modules', '.git', '.next', 'backups'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (/\.(ts|tsx|js|mjs|prisma)$/.test(file)) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk('.');
const envMap: Record<string, string[]> = {};

const regex = /process\.env(?:\.([A-Za-z0-9_]+)|\[['"]([A-Za-z0-9_]+)['"]\])|env\("([A-Za-z0-9_]+)"\)/g;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const envVar = match[1] || match[2] || match[3];
    if (envVar) {
      if (!envMap[envVar]) {
        envMap[envVar] = [];
      }
      if (!envMap[envVar].includes(file)) {
        envMap[envVar].push(file);
      }
    }
  }
}

const sorted = Object.keys(envMap).sort().map(k => ({
  variable: k,
  filesCount: envMap[k].length,
  files: envMap[k]
}));

console.log(JSON.stringify(sorted, null, 2));

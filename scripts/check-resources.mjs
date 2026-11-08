import fs from 'fs';
import path from 'path';

const resourcesDir = path.resolve('resources');
const availableFiles = new Set(fs.readdirSync(resourcesDir));

const REQUIRED_COMPONENTS = [
  'client',
  'dns',
  'cdn',
  'firewall',
  'waf',
  'rate-limiter',
  'api-gateway',
  'load-balancer',
  'router',
  'app-server',
  'cache',
  'message-queue',
  'worker',
  'database',
  'database-replica',
  'threat-source',
];

const ALIASES = {
  router: ['router.svg', 'router.png', 'nginx-reverse-proxy.svg', 'nginx-reverse-proxy.png'],
  cache: ['cache.svg', 'cache.png', 'redis-cache.svg', 'redis-cache.png'],
  'message-queue': ['message-queue.svg', 'message-queue.png', 'kafka.svg', 'kafka.png'],
  'app-server': ['app-server.svg', 'app-server.png'],
  'load-balancer': ['load-balancer.svg', 'load-balancer.png'],
  'api-gateway': ['api-gateway.svg', 'api-gateway.png'],
  'rate-limiter': ['rate-limiter.svg', 'rate-limiter.png'],
  client: ['client.svg', 'client.png'],
  dns: ['dns.svg', 'dns.png'],
  cdn: ['cdn.svg', 'cdn.png'],
  database: ['database.svg', 'database.png'],
  'database-replica': ['database-replica.svg', 'database-replica.png'],
  worker: ['worker.svg', 'worker.png'],
  firewall: ['firewall.svg', 'firewall.png'],
  waf: ['waf.svg', 'waf.png'],
  'threat-source': ['threat-source.svg', 'threat-source.png'],
};

console.log('Checking component assets in /resources...\n');

let allFound = true;
const summary = [];

for (const comp of REQUIRED_COMPONENTS) {
  const aliases = ALIASES[comp] || [`${comp}.svg`, `${comp}.png`];
  const foundFile = aliases.find((a) => availableFiles.has(a));

  if (foundFile) {
    summary.push({ Component: comp, Status: 'FOUND ✓', File: foundFile });
  } else {
    allFound = false;
    summary.push({ Component: comp, Status: 'MISSING ✗', File: 'None' });
  }
}

console.table(summary);

if (!allFound) {
  console.error('\nError: Some components are missing assets in /resources.');
  process.exit(1);
} else {
  console.log('\nAll 16 component types have valid assets in /resources.');
  process.exit(0);
}

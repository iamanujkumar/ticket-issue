import { registry } from '../../src/core/openapi/registry.js';

export function documentedRoutes() {
  return registry.definitions.filter((definition) => definition.type === 'route').map(({ route }) => route);
}

export function documentedResponseSchema(method, path, status) {
  const route = documentedRoutes().find((candidate) => candidate.method === method && candidate.path === path);
  if (!route) {
    throw new Error(`${method.toUpperCase()} ${path} is not documented`);
  }
  const schema = route.responses[status]?.content?.['application/json']?.schema;
  if (!schema) {
    throw new Error(`${method.toUpperCase()} ${path} has no documented ${status} JSON response`);
  }
  return schema;
}

export function expectMatchesDocs(response, method, path) {
  const result = documentedResponseSchema(method, path, response.status).safeParse(response.body);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`${method.toUpperCase()} ${path} ${response.status} does not match the docs:\n${problems}`);
  }
}

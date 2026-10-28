import { ValidationError } from '../errors/app_error.js';

const REQUEST_PARTS = ['params', 'query', 'body'];

function toDetail(part, issue) {
  return {
    path: [part, ...issue.path].join('.'),
    message: issue.message,
  };
}

export function validate(schemas) {
  return (req, _res, next) => {
    const validated = {};
    const details = [];

    for (const part of REQUEST_PARTS) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (result.success) {
        validated[part] = result.data;
      } else {
        details.push(...result.error.issues.map((issue) => toDetail(part, issue)));
      }
    }

    if (details.length > 0) {
      throw new ValidationError({ details });
    }

    req.validated = validated;
    next();
  };
}

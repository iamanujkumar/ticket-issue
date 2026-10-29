export function truncate(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

export function tagged(tag, content) {
  const safeContent = String(content).replace(/<\/?[a-z_]+>/gi, '');
  return `<${tag}>\n${safeContent}\n</${tag}>`;
}

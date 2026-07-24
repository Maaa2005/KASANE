export function renderJson(result: object): string {
  return JSON.stringify(result, null, 2);
}

declare module "node-cron" {
  const cron: { schedule: (expression: string, func: () => void) => void };
  export default cron;
}

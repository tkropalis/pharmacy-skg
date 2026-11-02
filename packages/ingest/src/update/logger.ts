/** Where a command reports to: the console for the commands, a list for the tests. */
export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export const consoleLogger: Logger = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

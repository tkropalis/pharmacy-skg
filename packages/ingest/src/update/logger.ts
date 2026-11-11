/** Where a command reports to: the console for the commands, a list for the tests. */
export interface Logger {
  log(message: string): void;
  error(message: string): void;
  /**
   * Something a person has to act on that a run cannot fix and should not fail for (a site that
   * blocks the run's network). Without it, `error` is used.
   */
  warn?(message: string): void;
}

export const consoleLogger: Logger = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  // On GitHub's runners, also a warning on the run's summary page.
  warn: (message) =>
    process.env.GITHUB_ACTIONS === 'true'
      ? console.log(`::warning::${message}`)
      : console.error(message),
};

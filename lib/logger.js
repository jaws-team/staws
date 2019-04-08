// deps
const chalk   = require("chalk");
const clear   = require('clear');
const CLI     = require('clui');
const figlet  = require('figlet');
const Spinner = CLI.Spinner;

// constants
const LOG_LEVEL = process.env.LOG_LEVEL || "ERROR";

class Logger {
  constructor(category = '') {
    this.category = category;
    this.debug(`Current log level : ${LOG_LEVEL}`)
  }

  header(title, desc='') {
    clear();
    this.log(
      figlet.textSync(title, { horizontalLayout: 'fitted' })
    );
    this.log(desc);
  }

  error(message, ...args) {
    if (["DEBUG", "INFO", "WARN", "ERROR"].includes(LOG_LEVEL))
      console.log(chalk.red(`${this.category} ERROR: ${message}`, ...args));
  }

  warn(message, ...args) {
    if (["DEBUG", "INFO", "WARN"].includes(LOG_LEVEL))
      console.log(chalk.yellow(`${this.category} WARN: ${message}`, ...args));
  }

  info(message, ...args) {
    if (["DEBUG", "INFO"].includes(LOG_LEVEL))
      console.log(chalk.white(`${this.category} INFO: ${message}`, ...args));
  }

  debug(message, ...args) {
    if (["DEBUG"].includes(LOG_LEVEL))
      console.log(chalk.white(`${this.category} DEBUG: ${message}`, ...args));
  }

  startProgressiveLog(message) {
    this.statusMessage = message;
    this.status = new Spinner(message);
    this.status.start();
  }

  updateProgressiveLog(message) {
    this.status.message(`${this.statusMessage} ${message}`);
  }

  stopProgressiveLog(message = '') {
    if(this.status) {
      this.status.stop();
      console.log(`${this.statusMessage} Ended ${message}`);
    }
  }

  log(message, ...args) {
    console.log(chalk.white(`${message}`, ...args));
  }

  // simple print
  print(message, ...args) {
    process.stdout.write(`${message}`, ...args);
  }
}
module.exports = new Logger();
